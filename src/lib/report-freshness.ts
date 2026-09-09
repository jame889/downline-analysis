import { createHash } from 'crypto'
import { loadBusinessReportSyncStatus, loadLatestBusinessReportSnapshot } from './business-report-sync'

export async function getFreshReport(now = new Date(), maxAgeMs = 3 * 60 * 60 * 1000) {
  const [status, snapshot] = await Promise.all([loadBusinessReportSyncStatus(), loadLatestBusinessReportSnapshot()])
  if (!status?.ok || !status.supabaseSynced || !snapshot || snapshot.month !== status.month
    || snapshot.checksum !== status.checksum || Date.parse(snapshot.syncedAt) !== Date.parse(status.syncedAt)
    || snapshot.reports.length !== status.rows || Object.keys(snapshot.members).length !== status.members) {
    throw new Error('Business Report sync is incomplete or inconsistent')
  }
  const age = now.getTime() - Date.parse(snapshot.syncedAt)
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) throw new Error('Business Report is stale')
  // Excel files can differ only in archive metadata. Use report values for stable delivery keys.
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now)
  const sourceVersion = `${day}:${snapshot.month}:` + createHash('sha256')
    .update(JSON.stringify(snapshot.reports.slice().sort((a, b) => a.member_id.localeCompare(b.member_id))))
    .digest('hex')
  return { snapshot, status, sourceVersion }
}
