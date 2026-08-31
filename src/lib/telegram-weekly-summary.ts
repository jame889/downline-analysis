import { getAvailableMonths, getMembersForMonth, getSubtreeIds } from './db'
import { loadBusinessReportSnapshot, loadBusinessReportSyncStatus } from './business-report-sync'

export interface TelegramWeeklySummary {
  month: string
  memberId: string
  teamMembers: number
  activeMembers: number
  totalBV: number
  totalVolLeft: number
  totalVolRight: number
  previousVolLeft: number
  previousVolRight: number
  currentVolLeft: number
  currentVolRight: number
  deductedVolLeft: number
  deductedVolRight: number
  sourceChecksum: string
  syncedAt: string
}

const DEFAULT_MAX_SYNC_AGE_MINUTES = 180

function weeklyMaxSyncAgeMs(): number {
  const configured = Number(process.env.TELEGRAM_WEEKLY_MAX_SYNC_AGE_MINUTES ?? DEFAULT_MAX_SYNC_AGE_MINUTES)
  const minutes = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_SYNC_AGE_MINUTES
  return minutes * 60_000
}

export async function assertTelegramWeeklyFreshness(now = new Date()): Promise<{ month: string; checksum: string; syncedAt: string }> {
  const status = await loadBusinessReportSyncStatus()
  if (!status?.ok) throw new Error('Weekly summary blocked: latest Business Report sync is unavailable')

  const snapshot = await loadBusinessReportSnapshot(status.month)
  if (!snapshot) throw new Error(`Weekly summary blocked: snapshot ${status.month} is unavailable`)
  if (snapshot.checksum !== status.checksum) {
    throw new Error(`Weekly summary blocked: checksum mismatch for ${status.month}`)
  }
  if (snapshot.syncedAt !== status.syncedAt) {
    throw new Error(`Weekly summary blocked: sync timestamp mismatch for ${status.month}`)
  }
  if (snapshot.reports.length !== status.rows || Object.keys(snapshot.members).length !== status.members) {
    throw new Error(`Weekly summary blocked: snapshot cardinality mismatch for ${status.month}`)
  }

  const syncedAt = new Date(status.syncedAt)
  const ageMs = now.getTime() - syncedAt.getTime()
  if (!Number.isFinite(syncedAt.getTime()) || ageMs < 0 || ageMs > weeklyMaxSyncAgeMs()) {
    throw new Error(`Weekly summary blocked: Business Report sync is stale (${status.syncedAt})`)
  }
  return { month: status.month, checksum: status.checksum, syncedAt: status.syncedAt }
}

export async function getTelegramWeeklySummary(memberId: string): Promise<TelegramWeeklySummary | null> {
  const freshness = await assertTelegramWeeklyFreshness()
  const months = (await getAvailableMonths()).slice().sort()
  const month = months.at(-1)
  if (!month) return null
  if (month !== freshness.month) {
    throw new Error(`Weekly summary blocked: latest data month ${month} does not match fresh sync ${freshness.month}`)
  }

  const data = await getMembersForMonth(month)
  const membersMap = Object.fromEntries(data.map((member) => [member.id, member]))
  const subtreeIds = getSubtreeIds(memberId, membersMap)
  const team = data.filter((member) => subtreeIds.has(member.id))
  const me = data.find((member) => member.id === memberId)
  if (!me) throw new Error(`Weekly summary member ${memberId} is missing from ${month}`)

  const report = me.report
  const expectedLeft = report.prev_month_vol_left + report.current_month_vol_left - report.deducted_vol_left
  const expectedRight = report.prev_month_vol_right + report.current_month_vol_right - report.deducted_vol_right
  const tolerance = 0.001
  if (Math.abs(report.total_vol_left - expectedLeft) > tolerance || Math.abs(report.total_vol_right - expectedRight) > tolerance) {
    throw new Error(
      `Weekly volume integrity failed for ${memberId}/${month}: ` +
      `left total=${report.total_vol_left}, expected=${expectedLeft}; ` +
      `right total=${report.total_vol_right}, expected=${expectedRight}`
    )
  }

  return {
    month,
    memberId,
    teamMembers: team.length,
    activeMembers: team.filter((member) => member.report.is_active).length,
    totalBV: team.reduce((sum, member) => sum + (member.report.monthly_bv ?? 0), 0),
    totalVolLeft: report.total_vol_left,
    totalVolRight: report.total_vol_right,
    previousVolLeft: report.prev_month_vol_left,
    previousVolRight: report.prev_month_vol_right,
    currentVolLeft: report.current_month_vol_left,
    currentVolRight: report.current_month_vol_right,
    deductedVolLeft: report.deducted_vol_left,
    deductedVolRight: report.deducted_vol_right,
    sourceChecksum: freshness.checksum,
    syncedAt: freshness.syncedAt,
  }
}

export function formatTelegramWeeklySummary(summary: TelegramWeeklySummary): string {
  const activePct = summary.teamMembers > 0 ? Math.round((summary.activeMembers / summary.teamMembers) * 100) : 0
  return (
    `<b>Weekly Summary - ${summary.month}</b>\n\n` +
    `สมาชิกในทีม: ${summary.teamMembers}\n` +
    `Active: ${summary.activeMembers} (${activePct}%)\n` +
    `Total BV: ${summary.totalBV.toLocaleString()}\n` +
    `Vol Left: ${summary.totalVolLeft.toLocaleString()}\n` +
    `Vol Right: ${summary.totalVolRight.toLocaleString()}\n\n` +
    `<i>Source: First Global Business Report • member ${summary.memberId} • sync ${summary.syncedAt} • checksum ${summary.sourceChecksum.slice(0, 12)}</i>`
  )
}
