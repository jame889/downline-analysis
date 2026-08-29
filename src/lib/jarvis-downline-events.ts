import crypto from 'crypto'
import type { BusinessReportSnapshot } from './business-report-sync'
import type { Member, MonthlyReport } from './types'

export const JARVIS_DOWNLINE_EVENT_TYPES = [
  'jarvis.downline.member_joined',
  'jarvis.downline.bv_changed',
  'jarvis.downline.rank_changed',
  'jarvis.downline.leg_growth',
  'jarvis.downline.activity_added',
  'jarvis.downline.inactive_risk',
  'jarvis.downline.keyman_emerging',
  'jarvis.downline.keyman_declining',
  'jarvis.downline.goal_progress',
  'jarvis.downline.sync_completed',
] as const

export type JarvisDownlineEventType = typeof JARVIS_DOWNLINE_EVENT_TYPES[number]

export interface JarvisDownlineEvent {
  id: string
  type: JarvisDownlineEventType
  occurredAt: string
  source: 'downline-analyzer'
  version: 1
  month: string
  payload: Record<string, unknown>
}

function stableId(type: JarvisDownlineEventType, month: string, payload: Record<string, unknown>): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ type, month, payload }))
    .digest('hex')
    .slice(0, 32)
}

function emit(
  events: JarvisDownlineEvent[],
  type: JarvisDownlineEventType,
  month: string,
  occurredAt: string,
  payload: Record<string, unknown>
) {
  events.push({
    id: stableId(type, month, payload),
    type,
    occurredAt,
    source: 'downline-analyzer',
    version: 1,
    month,
    payload,
  })
}

function reportMap(snapshot: BusinessReportSnapshot | null): Map<string, MonthlyReport> {
  return new Map((snapshot?.reports ?? []).map((report) => [String(report.member_id), report]))
}

function memberSummary(member: Member, report?: MonthlyReport) {
  return {
    id: member.id,
    name: member.name,
    sponsorId: member.sponsor_id,
    uplineId: member.upline_id,
    joinDate: member.join_date,
    rank: report?.income_position ?? null,
    highestPosition: report?.highest_position ?? null,
    promotionGoal: report?.promotion_goal ?? null,
    monthlyBV: report?.monthly_bv ?? 0,
    active: report?.is_active ?? false,
    qualified: report?.is_qualified ?? false,
    leftVolume: report?.current_month_vol_left ?? 0,
    rightVolume: report?.current_month_vol_right ?? 0,
  }
}

export function buildDownlineDiffEvents(
  previous: BusinessReportSnapshot | null,
  current: BusinessReportSnapshot
): JarvisDownlineEvent[] {
  const events: JarvisDownlineEvent[] = []
  const now = current.syncedAt || new Date().toISOString()
  const previousReports = reportMap(previous)
  const currentReports = reportMap(current)

  for (const [id, member] of Object.entries(current.members)) {
    const currentReport = currentReports.get(id)
    const previousMember = previous?.members?.[id]
    const previousReport = previousReports.get(id)

    if (!previousMember) {
      emit(events, 'jarvis.downline.member_joined', current.month, now, {
        member: memberSummary(member, currentReport),
      })
      continue
    }

    if (!currentReport || !previousReport) continue

    const rankChanged = previousReport.income_position !== currentReport.income_position
    if (rankChanged) {
      emit(events, 'jarvis.downline.rank_changed', current.month, now, {
        memberId: id,
        name: member.name,
        from: previousReport.income_position,
        to: currentReport.income_position,
        highestPosition: currentReport.highest_position,
      })
    }

    const monthlyBvDelta = currentReport.monthly_bv - previousReport.monthly_bv
    const leftDelta = currentReport.current_month_vol_left - previousReport.current_month_vol_left
    const rightDelta = currentReport.current_month_vol_right - previousReport.current_month_vol_right

    if (monthlyBvDelta !== 0 || leftDelta !== 0 || rightDelta !== 0) {
      emit(events, 'jarvis.downline.bv_changed', current.month, now, {
        memberId: id,
        name: member.name,
        before: {
          monthlyBV: previousReport.monthly_bv,
          leftVolume: previousReport.current_month_vol_left,
          rightVolume: previousReport.current_month_vol_right,
        },
        after: {
          monthlyBV: currentReport.monthly_bv,
          leftVolume: currentReport.current_month_vol_left,
          rightVolume: currentReport.current_month_vol_right,
        },
        delta: { monthlyBV: monthlyBvDelta, leftVolume: leftDelta, rightVolume: rightDelta },
      })
    }

    if (leftDelta !== 0 || rightDelta !== 0) {
      emit(events, 'jarvis.downline.leg_growth', current.month, now, {
        memberId: id,
        name: member.name,
        leftDelta,
        rightDelta,
        leftVolume: currentReport.current_month_vol_left,
        rightVolume: currentReport.current_month_vol_right,
        weakerLeg: currentReport.current_month_vol_left <= currentReport.current_month_vol_right ? 'left' : 'right',
      })
    }

    if (previousReport.is_active && !currentReport.is_active) {
      emit(events, 'jarvis.downline.inactive_risk', current.month, now, {
        memberId: id,
        name: member.name,
        previousMonthlyBV: previousReport.monthly_bv,
        monthlyBV: currentReport.monthly_bv,
        rank: currentReport.income_position,
        reason: 'became_inactive',
      })
    }

    if (previousReport.promotion_goal !== currentReport.promotion_goal || rankChanged) {
      emit(events, 'jarvis.downline.goal_progress', current.month, now, {
        memberId: id,
        name: member.name,
        previousGoal: previousReport.promotion_goal,
        goal: currentReport.promotion_goal,
        previousRank: previousReport.income_position,
        rank: currentReport.income_position,
      })
    }

    const positiveMomentum = rankChanged || monthlyBvDelta >= 500 || leftDelta + rightDelta >= 1000
    if (positiveMomentum && currentReport.is_active) {
      emit(events, 'jarvis.downline.keyman_emerging', current.month, now, {
        memberId: id,
        name: member.name,
        rank: currentReport.income_position,
        monthlyBvDelta,
        leftDelta,
        rightDelta,
        signal: rankChanged ? 'rank_progress' : monthlyBvDelta >= 500 ? 'bv_acceleration' : 'leg_growth',
      })
    }

    const negativeMomentum = (previousReport.is_active && !currentReport.is_active) || monthlyBvDelta <= -500
    if (negativeMomentum) {
      emit(events, 'jarvis.downline.keyman_declining', current.month, now, {
        memberId: id,
        name: member.name,
        rank: currentReport.income_position,
        monthlyBvDelta,
        active: currentReport.is_active,
        signal: !currentReport.is_active ? 'inactive' : 'bv_drop',
      })
    }
  }

  emit(events, 'jarvis.downline.sync_completed', current.month, now, {
    checksum: current.checksum,
    previousChecksum: previous?.checksum ?? null,
    memberCount: Object.keys(current.members).length,
    diffEventCount: events.length,
    changed: previous?.checksum !== current.checksum,
  })

  return events
}

export interface JarvisPushResult {
  ok: boolean
  skipped?: boolean
  status?: number
  error?: string
}

export async function pushDownlineEventsToJarvis(events: JarvisDownlineEvent[]): Promise<JarvisPushResult> {
  const url = process.env.JARVIS_DOWNLINE_INGEST_URL
  const secret = process.env.JARVIS_DOWNLINE_INGEST_SECRET
  if (!url || !secret) return { ok: true, skipped: true }

  const body = JSON.stringify({ source: 'downline-analyzer', version: 1, events })
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex')

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-jarvis-source': 'downline-analyzer',
        'x-jarvis-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      return { ok: false, status: response.status, error: (await response.text()).slice(0, 1000) }
    }
    return { ok: true, status: response.status }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
