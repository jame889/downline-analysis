import crypto from 'crypto'
import type { BusinessReportSnapshot } from './business-report-sync'

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

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function pickMemberSummary(member: Record<string, unknown>) {
  return {
    id: member.id ?? member.memberId ?? member.code ?? null,
    name: member.name ?? member.fullName ?? member.displayName ?? null,
    rank: member.rank ?? member.position ?? null,
    leftBV: toNumber(member.leftBV ?? member.left_bv ?? member.volL),
    rightBV: toNumber(member.rightBV ?? member.right_bv ?? member.volR),
    totalBV: toNumber(member.totalBV ?? member.total_bv ?? member.bv),
    sponsorId: member.sponsorId ?? member.sponsor_id ?? null,
  }
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

export function buildDownlineDiffEvents(
  previous: BusinessReportSnapshot | null,
  current: BusinessReportSnapshot
): JarvisDownlineEvent[] {
  const events: JarvisDownlineEvent[] = []
  const now = current.syncedAt || new Date().toISOString()
  const prevMembers = previous?.members ?? {}
  const currMembers = current.members ?? {}

  for (const [id, rawCurrent] of Object.entries(currMembers)) {
    const currentMember = rawCurrent as unknown as Record<string, unknown>
    const rawPrevious = prevMembers[id]
    if (!rawPrevious) {
      emit(events, 'jarvis.downline.member_joined', current.month, now, {
        member: pickMemberSummary(currentMember),
      })
      continue
    }

    const previousMember = rawPrevious as unknown as Record<string, unknown>
    const before = pickMemberSummary(previousMember)
    const after = pickMemberSummary(currentMember)

    if (before.rank !== after.rank) {
      emit(events, 'jarvis.downline.rank_changed', current.month, now, {
        memberId: after.id ?? id,
        name: after.name,
        from: before.rank,
        to: after.rank,
      })
    }

    if (before.totalBV !== after.totalBV || before.leftBV !== after.leftBV || before.rightBV !== after.rightBV) {
      emit(events, 'jarvis.downline.bv_changed', current.month, now, {
        memberId: after.id ?? id,
        name: after.name,
        before: { totalBV: before.totalBV, leftBV: before.leftBV, rightBV: before.rightBV },
        after: { totalBV: after.totalBV, leftBV: after.leftBV, rightBV: after.rightBV },
        delta: {
          totalBV: after.totalBV - before.totalBV,
          leftBV: after.leftBV - before.leftBV,
          rightBV: after.rightBV - before.rightBV,
        },
      })

      const leftDelta = after.leftBV - before.leftBV
      const rightDelta = after.rightBV - before.rightBV
      if (leftDelta !== 0 || rightDelta !== 0) {
        emit(events, 'jarvis.downline.leg_growth', current.month, now, {
          memberId: after.id ?? id,
          name: after.name,
          leftDelta,
          rightDelta,
          weakerLeg: after.leftBV <= after.rightBV ? 'left' : 'right',
        })
      }
    }
  }

  emit(events, 'jarvis.downline.sync_completed', current.month, now, {
    checksum: current.checksum,
    previousChecksum: previous?.checksum ?? null,
    memberCount: Object.keys(currMembers).length,
    eventCount: events.length,
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
