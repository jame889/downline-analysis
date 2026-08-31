import { NextRequest, NextResponse } from 'next/server'
import { getAvailableMonths, getMembersForMonth, getSubtreeIds } from '@/lib/db'
import { buildTelegramActivityMessage } from '@/lib/telegram-activity-message'
import { getTelegramBotToken, loadTelegramConfigs, notificationEnabled, sendTelegramMessage } from '@/lib/telegram-config'
import { buildKeymanGoalAlertMessage } from '@/lib/telegram-keyman-alert'
import { formatTelegramWeeklySummary, getTelegramWeeklySummary } from '@/lib/telegram-weekly-summary'

export const dynamic = 'force-dynamic'

async function buildWeeklyMessage(memberId: string): Promise<string> {
  const summary = await getTelegramWeeklySummary(memberId)
  return summary ? formatTelegramWeeklySummary(summary) : 'ไม่มีข้อมูล'
}

async function buildWakeupMessage(memberId: string): Promise<string> {
  const months = (await getAvailableMonths()).slice().sort()
  const month = months[months.length - 1]
  if (!month) return 'ไม่มีข้อมูล'

  const data = await getMembersForMonth(month)
  const membersMap = Object.fromEntries(data.map((m) => [m.id, m]))
  const subtreeIds = getSubtreeIds(memberId, membersMap)
  const inactive = data.filter((m) => subtreeIds.has(m.id) && !m.report.is_active && m.upline_id === memberId)

  if (inactive.length === 0) return `<b>Re-engagement ${month}</b>\n\nDownline ตรงทุกคน Active อยู่`

  const lines = inactive.map((m) => `- ${m.name} (${m.id})`)
  return (
    `<b>Re-engagement Alert ${month}</b>\n\nDownline ตรงที่ Inactive:\n` +
    `${lines.slice(0, 20).join('\n')}${lines.length > 20 ? `\n... และอีก ${lines.length - 20} คน` : ''}\n\n` +
    `ลองติดต่อเพื่อกระตุ้นการทำงาน`
  )
}

async function buildWatchlistMessage(memberId: string): Promise<string> {
  const months = (await getAvailableMonths()).slice().sort()
  if (months.length < 2) return 'ไม่มีข้อมูลเพียงพอสำหรับ Watchlist'

  const currentMonth = months[months.length - 1]
  const prevMonth = months[months.length - 2]
  const current = await getMembersForMonth(currentMonth)
  const prev = await getMembersForMonth(prevMonth)
  const membersMap = Object.fromEntries(current.map((m) => [m.id, m]))
  const subtreeIds = getSubtreeIds(memberId, membersMap)

  const prevMap = new Map<string, boolean>()
  for (const m of prev) {
    if (subtreeIds.has(m.id)) prevMap.set(m.id, m.report.is_active)
  }

  const atRisk: string[] = []
  for (const m of current) {
    if (!subtreeIds.has(m.id)) continue
    const wasActive = prevMap.get(m.id)
    if (wasActive && !m.report.is_active) {
      atRisk.push(`- ${m.name} (${m.id}): Active → Inactive`)
    }
  }

  if (atRisk.length === 0) return `<b>Watchlist ${currentMonth}</b>\n\nไม่มีสมาชิกที่เสี่ยง`
  return (
    `<b>Watchlist Alert ${currentMonth}</b>\n\nสมาชิกที่เปลี่ยนจาก Active เป็น Inactive:\n` +
    `${atRisk.slice(0, 20).join('\n')}${atRisk.length > 20 ? `\n... และอีก ${atRisk.length - 20} คน` : ''}`
  )
}

// Map cron type to notification type and day description
const CRON_SCHEDULES: Record<string, { type: 'weekly' | 'wakeup' | 'watchlist' | 'activity' | 'keyman'; label: string }> = {
  weekly: { type: 'weekly', label: 'Weekly Report (จันทร์ 8:00)' },
  wakeup: { type: 'wakeup', label: 'Wakeup Alert (อังคาร-ศุกร์ 9:00)' },
  watchlist: { type: 'watchlist', label: 'Watchlist (อาทิตย์ 10:00)' },
  activity: { type: 'activity', label: 'Daily Activity (ทุกวัน 8:00)' },
  keyman: { type: 'keyman', label: 'Keyman Goal Alert (ทุกวัน 8:00)' },
}

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { searchParams } = new URL(request.url)
  const cronType = searchParams.get('type') ?? 'weekly'

  const schedule = CRON_SCHEDULES[cronType]
  if (!schedule) {
    return NextResponse.json({ error: 'Invalid cron type. Use: activity, keyman, weekly, wakeup, watchlist' }, { status: 400 })
  }

  const allConfigs = await loadTelegramConfigs()

  const results: { memberId: string; success: boolean; error?: string }[] = []

  for (const [memberId, config] of Object.entries(allConfigs)) {
    if (!config.enabled || !notificationEnabled(config, schedule.type)) continue

    const botToken = getTelegramBotToken(allConfigs, memberId)
    if (!botToken) {
      results.push({ memberId, success: false, error: 'No bot token' })
      continue
    }

    let message: string
    switch (schedule.type) {
      case 'weekly':
        message = await buildWeeklyMessage(memberId)
        break
      case 'wakeup':
        message = await buildWakeupMessage(memberId)
        break
      case 'watchlist':
        message = await buildWatchlistMessage(memberId)
        break
      case 'activity':
        message = await buildTelegramActivityMessage(memberId)
        break
      case 'keyman':
        message = await buildKeymanGoalAlertMessage(memberId)
        break
    }

    const success = await sendTelegramMessage(config.chatId, message, botToken)
    results.push({ memberId, success })
  }

  const sent = results.filter((r) => r.success).length
  console.log(`[Cron Telegram] ${schedule.label}: sent ${sent}/${results.length}`)

  return NextResponse.json({ ok: true, type: cronType, sent, total: results.length, results })
}
