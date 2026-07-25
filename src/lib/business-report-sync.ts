import fs from 'fs'
import path from 'path'
import type { Member, MonthlyReport } from './types'
import { hasSupabase, sbSelect, sbUpsert } from './supabase'

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

export async function saveBusinessReportSyncStatus(status: BusinessReportSyncStatus): Promise<void> {
  if (hasSupabase()) {
    await sbUpsert('business_report_sync_status', {
      singleton: true,
      payload: status,
      updated_at: status.syncedAt,
    })
    return
  }

  fs.mkdirSync(path.dirname(LOCAL_STATUS_PATH), { recursive: true })
  fs.writeFileSync(LOCAL_STATUS_PATH, JSON.stringify(status, null, 2), 'utf-8')
}

export async function loadBusinessReportSyncStatus(): Promise<BusinessReportSyncStatus | null> {
  try {
    if (hasSupabase()) {
      const rows = await sbSelect<{ payload: BusinessReportSyncStatus }>(
        'business_report_sync_status',
        'singleton=eq.true&select=payload'
      )
      return rows[0]?.payload ?? null
    }
    if (!fs.existsSync(LOCAL_STATUS_PATH)) return null
    return JSON.parse(fs.readFileSync(LOCAL_STATUS_PATH, 'utf-8')) as BusinessReportSyncStatus
  } catch {
    return null
  }
}

function snapshotLocalPath(month: string): string {
  return path.join(LOCAL_DIR, `${month}.json`)
}

export async function loadBusinessReportMonths(): Promise<string[]> {
  if (hasSupabase()) {
    const rows = await sbSelect<{ month: string }>('business_report_snapshots', 'select=month')
    return rows.map((row) => row.month).sort()
  }
  if (!fs.existsSync(LOCAL_DIR)) return []
  return fs.readdirSync(LOCAL_DIR)
    .filter((name) => /^\d{4}-\d{2}\.json$/.test(name))
    .map((name) => name.slice(0, 7))
    .sort()
}

export async function loadBusinessReportSnapshot(month: string): Promise<BusinessReportSnapshot | null> {
  if (hasSupabase()) {
    const rows = await sbSelect<{
      month: string
      checksum: string
      members: Record<string, Member>
      reports: MonthlyReport[]
      synced_at: string
    }>(
      'business_report_snapshots',
      `month=eq.${encodeURIComponent(month)}&select=*`
    )
    const row = rows[0]
    return row ? {
      month: row.month,
      checksum: row.checksum,
      members: row.members,
      reports: row.reports,
      syncedAt: row.synced_at,
    } : null
  }
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
  if (hasSupabase()) {
    await sbUpsert('business_report_snapshots', {
      month: snapshot.month,
      checksum: snapshot.checksum,
      members: snapshot.members,
      reports: snapshot.reports,
      synced_at: snapshot.syncedAt,
    })
    return
  }

  fs.mkdirSync(LOCAL_DIR, { recursive: true })
  fs.writeFileSync(snapshotLocalPath(snapshot.month), JSON.stringify(snapshot), 'utf-8')
}
