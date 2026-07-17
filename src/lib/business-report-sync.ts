import fs from 'fs'
import path from 'path'
import { get, put } from '@vercel/blob'

const BLOB_PATH = 'system/business-report-sync-status.json'
const LOCAL_PATH = path.join(process.cwd(), 'data', 'business-report-sync-status.json')

export interface BusinessReportSyncStatus {
  ok: boolean
  month: string
  rows: number
  members: number
  checksum: string
  syncedAt: string
  telegramNotified: boolean
}

function hasBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
}

export async function saveBusinessReportSyncStatus(status: BusinessReportSyncStatus): Promise<void> {
  if (hasBlobStorage()) {
    await put(BLOB_PATH, JSON.stringify(status), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: 'application/json',
    })
    return
  }

  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true })
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(status, null, 2), 'utf-8')
}

export async function loadBusinessReportSyncStatus(): Promise<BusinessReportSyncStatus | null> {
  try {
    if (hasBlobStorage()) {
      const result = await get(BLOB_PATH, { access: 'private', useCache: false })
      if (!result || result.statusCode !== 200) return null
      return JSON.parse(await new Response(result.stream).text()) as BusinessReportSyncStatus
    }
    if (!fs.existsSync(LOCAL_PATH)) return null
    return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf-8')) as BusinessReportSyncStatus
  } catch {
    return null
  }
}
