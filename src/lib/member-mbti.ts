import fs from 'fs'
import path from 'path'
import { BlobPreconditionFailedError, get, put } from '@vercel/blob'
import type { MbtiType } from './mbti'

const BLOB_PATH = 'member-metadata/mbti.json'
const LOCAL_PATH = path.join(process.cwd(), 'data', 'member-mbti.json')

type MbtiOverrides = Record<string, MbtiType>
type BlobMbtiStore = { values: MbtiOverrides; etag?: string }

function hasBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
}

function readLocal(): MbtiOverrides {
  try {
    if (!fs.existsSync(LOCAL_PATH)) return {}
    return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf-8')) as MbtiOverrides
  } catch {
    return {}
  }
}

async function readBlob(): Promise<BlobMbtiStore> {
  const result = await get(BLOB_PATH, { access: 'private', useCache: false })
  if (!result || result.statusCode !== 200) return { values: {} }
  const text = await new Response(result.stream).text()
  return { values: JSON.parse(text) as MbtiOverrides, etag: result.blob.etag }
}

export async function loadMemberMbtiOverrides(): Promise<MbtiOverrides> {
  if (!hasBlobStorage()) return readLocal()
  try {
    return (await readBlob()).values
  } catch (error) {
    console.error('[member-mbti] Failed to read Blob storage', error)
    return {}
  }
}

export async function saveMemberMbti(memberId: string, mbti: MbtiType | null): Promise<void> {
  if (!hasBlobStorage()) {
    const values = readLocal()
    if (mbti) values[memberId] = mbti
    else delete values[memberId]
    fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true })
    fs.writeFileSync(LOCAL_PATH, JSON.stringify(values, null, 2), 'utf-8')
    return
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { values, etag } = await readBlob()
    if (mbti) values[memberId] = mbti
    else delete values[memberId]

    try {
      await put(BLOB_PATH, JSON.stringify(values), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: Boolean(etag),
        cacheControlMaxAge: 60,
        contentType: 'application/json',
        ...(etag ? { ifMatch: etag } : {}),
      })
      return
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError) || attempt === 2) throw error
    }
  }
}
