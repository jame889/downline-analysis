import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  loadBusinessReportSnapshot,
  saveBusinessReportSnapshot,
  saveBusinessReportSyncStatus,
} from '@/lib/business-report-sync'
import { upsertMembers, upsertMonthlyReports } from '@/lib/db'
import { sbSelect } from '@/lib/supabase'
import { loadTelegramConfigs, sendTelegramMessage } from '@/lib/telegram-config'
import type { Member, MonthlyReport } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface SyncPayload {
  month: string
  checksum: string
  members: Record<string, Member>
  reports: MonthlyReport[]
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.BUSINESS_REPORT_SYNC_SECRET ?? ''
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!secret || !supplied || secret.length !== supplied.length) return false
  return timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))
}

function validatePayload(value: unknown): { payload?: SyncPayload; error?: string } {
  if (!value || typeof value !== 'object') return { error: 'Invalid JSON payload' }
  const payload = value as Partial<SyncPayload>
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(payload.month ?? '')) return { error: 'Invalid month' }
  if (!/^[a-f0-9]{64}$/i.test(payload.checksum ?? '')) return { error: 'Invalid checksum' }
  if (!payload.members || typeof payload.members !== 'object' || Array.isArray(payload.members)) {
    return { error: 'Invalid members' }
  }
  if (!Array.isArray(payload.reports) || payload.reports.length < 100 || payload.reports.length > 10_000) {
    return { error: 'Unexpected report row count' }
  }

  const memberIds = Object.keys(payload.members)
  const reportIds = payload.reports.map((report) => String(report?.member_id ?? ''))
  if (!memberIds.includes('900057')) return { error: 'Root member 900057 is missing' }
  if (memberIds.length !== new Set(memberIds).size || reportIds.length !== new Set(reportIds).size) {
    return { error: 'Duplicate member ids' }
  }
  if (payload.reports.some((report) => report.month !== payload.month || !payload.members?.[report.member_id])) {
    return { error: 'Report/member mismatch' }
  }

  const directUplineCounts = new Map<string, number>()
  for (const member of Object.values(payload.members)) {
    if (!member || member.id === '' || !member.name) return { error: 'Invalid member row' }
    if (!member.upline_id) continue
    const count = (directUplineCounts.get(member.upline_id) ?? 0) + 1
    if (count > 2) return { error: `Invalid binary placement under upline ${member.upline_id}` }
    directUplineCounts.set(member.upline_id, count)
  }

  return { payload: payload as SyncPayload }
}

async function notifyRoot(month: string, rows: number, checksum: string): Promise<boolean> {
  const rootId = process.env.NEXT_PUBLIC_ROOT_MEMBER_ID ?? '900057'
  const config = (await loadTelegramConfigs())[rootId]
  const token = config?.botToken ?? process.env.TELEGRAM_BOT_TOKEN
  if (!config?.enabled || !config.chatId || !token) return false
  return sendTelegramMessage(
    config.chatId,
    `<b>Business Report updated</b>\n\nMonth: ${month}\nMembers: ${rows}\nChecksum: ${checksum.slice(0, 12)}`,
    token
  )
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { loadBusinessReportSyncStatus } = await import('@/lib/business-report-sync')
  return NextResponse.json({ ok: true, status: await loadBusinessReportSyncStatus() })
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const validation = validatePayload(await request.json())
    if (!validation.payload) return NextResponse.json({ error: validation.error }, { status: 400 })
    const { month, checksum, members, reports } = validation.payload

    const existingSnapshot = await loadBusinessReportSnapshot(month)
    let existingCount = existingSnapshot?.reports.length ?? 0
    if (existingCount === 0 && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const existing = await sbSelect<{ member_id: string }>(
          'monthly_reports',
          `month=eq.${encodeURIComponent(month)}&select=member_id`
        )
        existingCount = existing.length
      } catch (error) {
        console.warn('[business-report-sync] Supabase count unavailable', error)
      }
    }
    if (existingCount >= 100 && reports.length < Math.floor(existingCount * 0.9)) {
      return NextResponse.json({ error: `Suspicious row decrease: ${existingCount} to ${reports.length}` }, { status: 409 })
    }

    const syncedAt = new Date().toISOString()
    await saveBusinessReportSnapshot({ month, checksum, members, reports, syncedAt })
    let supabaseSynced = false
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        await upsertMembers(members)
        await upsertMonthlyReports(month, reports)
        supabaseSynced = true
      } catch (error) {
        console.warn('[business-report-sync] Supabase sync unavailable; Blob snapshot saved', error)
      }
    }
    const telegramNotified = await notifyRoot(month, reports.length, checksum)
    const status = {
      ok: true,
      month,
      rows: reports.length,
      members: Object.keys(members).length,
      checksum,
      syncedAt,
      telegramNotified,
      supabaseSynced,
    }
    await saveBusinessReportSyncStatus(status)
    return NextResponse.json(status)
  } catch (error) {
    console.error('[business-report-sync]', error)
    return NextResponse.json({ error: 'Business report sync failed' }, { status: 500 })
  }
}
