import fs from 'fs'
import path from 'path'
import { get, put } from '@vercel/blob'
import type { Member, MonthlyReport } from './types'

const STATUS_BLOB_PATH = 'system/business-report-sync-status.json'
const INDEX_BLOB_PATH = 'system/business-reports/index.json'
const LOCAL_DIR = path.join(process.cwd(), 'data', 'automated-reports')
const LOCAL_STATUS_PATH = path.join(process.cwd(), 'data', 'business-report-sync-status.json')

export interface BusinessReportSyncStatus {
  ok: boolean
  month: string
  rows: number
  members: number
  checksum: string
  syncedAt: string
  telegramNotified: boolean
  supabaseSynced: boolean
}

export interface BusinessReportSnapshot {
  month: string
  checksum: string
  members: Record<string, Member>
  reports: MonthlyReport[]
  syncedAt: string
}

function hasBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
}

export async function saveBusinessReportSyncStatus(status: BusinessReportSyncStatus): Promise<void> {
  if (hasBlobStorage()) {
    await put(STATUS_BLOB_PATH, JSON.stringify(status), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: 'application/json',
    })
    return
  }

  fs.mkdirSync(path.dirname(LOCAL_STATUS_PATH), { recursive: true })
  fs.writeFileSync(LOCAL_STATUS_PATH, JSON.stringify(status, null, 2), 'utf-8')
}

export async function loadBusinessReportSyncStatus(): Promise<BusinessReportSyncStatus | null> {
  try {
    if (hasBlobStorage()) {
      const result = await get(STATUS_BLOB_PATH, { access: 'private', useCache: false })
      if (!result || result.statusCode !== 200) return null
      return JSON.parse(await new Response(result.stream).text()) as BusinessReportSyncStatus
    }
    if (!fs.existsSync(LOCAL_STATUS_PATH)) return null
    return JSON.parse(fs.readFileSync(LOCAL_STATUS_PATH, 'utf-8')) as BusinessReportSyncStatus
  } catch {
    return null
  }
}

function snapshotBlobPath(month: string): string {
  return `system/business-reports/${month}.json`
}

function snapshotLocalPath(month: string): string {
  return path.join(LOCAL_DIR, `${month}.json`)
}

async function readPrivateBlob<T>(blobPath: string): Promise<T | null> {
  try {
    const result = await get(blobPath, { access: 'private', useCache: false })
    if (!result || result.statusCode !== 200) return null
    return JSON.parse(await new Response(result.stream).text()) as T
  } catch {
    return null
  }
}

export async function loadBusinessReportMonths(): Promise<string[]> {
  if (hasBlobStorage()) return (await readPrivateBlob<string[]>(INDEX_BLOB_PATH)) ?? []
  if (!fs.existsSync(LOCAL_DIR)) return []
  return fs.readdirSync(LOCAL_DIR)
    .filter((name) => /^\d{4}-\d{2}\.json$/.test(name))
    .map((name) => name.slice(0, 7))
    .sort()
}

export async function loadBusinessReportSnapshot(month: string): Promise<BusinessReportSnapshot | null> {
  if (hasBlobStorage()) return readPrivateBlob<BusinessReportSnapshot>(snapshotBlobPath(month))
  const file = snapshotLocalPath(month)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as BusinessReportSnapshot
  } catch {
    return null
  }
}

export async function loadLatestBusinessReportSnapshot(): Promise<BusinessReportSnapshot | null> {
  const months = await loadBusinessReportMonths()
  const latest = months.slice().sort().pop()
  return latest ? loadBusinessReportSnapshot(latest) : null
}

export async function saveBusinessReportSnapshot(snapshot: BusinessReportSnapshot): Promise<void> {
  if (hasBlobStorage()) {
    await put(snapshotBlobPath(snapshot.month), JSON.stringify(snapshot), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: 'application/json',
    })
    const months = Array.from(new Set([...(await loadBusinessReportMonths()), snapshot.month])).sort()
    await put(INDEX_BLOB_PATH, JSON.stringify(months), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: 'application/json',
    })
    return
  }

  fs.mkdirSync(LOCAL_DIR, { recursive: true })
  fs.writeFileSync(snapshotLocalPath(snapshot.month), JSON.stringify(snapshot), 'utf-8')
}
