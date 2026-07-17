import fs from 'fs'
import path from 'path'
import { BlobPreconditionFailedError, get, put } from '@vercel/blob'

const BLOB_PATH = 'member-activities/daily-activities.json'
const LOCAL_PATH = path.join(process.cwd(), 'data', 'daily-activities.json')

export const ACTIVITY_TYPES = [
  'post_social',
  'appointment_call',
  'promotion_call',
  'house_meeting',
  'start_up',
  'zoom_line_meeting',
  'unlock_meeting',
  'big_house',
  'one_day_take_off',
  'the_first_class',
  'star_forum',
  'camp',
] as const

export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export interface DailyActivity {
  id: string
  memberId: string
  date: string
  startTime: string
  endTime: string
  type: ActivityType
  details: string
  leftCount: number
  rightCount: number
  createdAt: string
  updatedAt: string
}

type ActivityStore = Record<string, DailyActivity>
type BlobStore = { values: ActivityStore; etag?: string }

function hasBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
}

function readLocal(): ActivityStore {
  try {
    if (!fs.existsSync(LOCAL_PATH)) return {}
    return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf-8')) as ActivityStore
  } catch {
    return {}
  }
}

function writeLocal(values: ActivityStore): void {
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true })
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(values, null, 2), 'utf-8')
}

async function readBlob(): Promise<BlobStore> {
  const result = await get(BLOB_PATH, { access: 'private', useCache: false })
  if (!result || result.statusCode !== 200) return { values: {} }
  const text = await new Response(result.stream).text()
  return { values: JSON.parse(text) as ActivityStore, etag: result.blob.etag }
}

export async function loadDailyActivities(): Promise<ActivityStore> {
  if (!hasBlobStorage()) return readLocal()
  try {
    return (await readBlob()).values
  } catch (error) {
    console.error('[daily-activities] Failed to read Blob storage', error)
    return {}
  }
}

async function mutateStore(mutator: (values: ActivityStore) => void): Promise<void> {
  if (!hasBlobStorage()) {
    const values = readLocal()
    mutator(values)
    writeLocal(values)
    return
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { values, etag } = await readBlob()
    mutator(values)

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

export async function saveDailyActivity(activity: DailyActivity): Promise<void> {
  await mutateStore((values) => {
    values[activity.id] = activity
  })
}

export async function deleteDailyActivity(id: string, memberId: string): Promise<boolean> {
  let deleted = false
  await mutateStore((values) => {
    if (values[id]?.memberId === memberId) {
      delete values[id]
      deleted = true
    }
  })
  return deleted
}
