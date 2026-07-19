import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAvailableMonths, getMembersForMonth, getSubtreeIds } from '@/lib/db'
import { getDailyActivityAnalysis } from '@/lib/daily-activities'
import { getTelegramBotToken, loadTelegramConfigs, sendTelegramMessage, type TelegramNotificationType } from '@/lib/telegram-config'
import { buildKeymanGoalAlertMessage } from '@/lib/telegram-keyman-alert'

export const dynamic = 'force-dynamic'

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
      atRisk.push(`- ${m.name} (${m.id}): Active -> Inactive`)
    }
  }

  if (atRisk.length === 0) return `<b>Watchlist ${currentMonth}</b>\n\nไม่มีสมาชิกที่เสี่ยง`
  return `<b>Watchlist Alert ${currentMonth}</b>\n\nสมาชิกที่เปลี่ยนจาก Active เป็น Inactive:\n${atRisk.slice(0, 20).join('\n')}${atRisk.length > 20 ? `\n... และอีก ${atRisk.length - 20} คน` : ''}`
}

async function buildLeaderboardMessage(): Promise<string> {
  const months = (await getAvailableMonths()).slice().sort()
  const month = months[months.length - 1]
  if (!month) return 'ไม่มีข้อมูล'

  const data = await getMembersForMonth(month)
  const topBV = data
    .slice()
    .sort((a, b) => (b.report.monthly_bv ?? 0) - (a.report.monthly_bv ?? 0))
    .slice(0, 5)

  const lines = topBV.map((m, i) => `${i + 1}. ${m.name} - BV: ${(m.report.monthly_bv ?? 0).toLocaleString()}`)
  return `<b>Top 5 BV - ${month}</b>\n\n${lines.join('\n')}`
}

async function buildWeeklyMessage(memberId: string): Promise<string> {
  const months = (await getAvailableMonths()).slice().sort()
  const month = months[months.length - 1]
  if (!month) return 'ไม่มีข้อมูล'

  const data = await getMembersForMonth(month)
  const membersMap = Object.fromEntries(data.map((m) => [m.id, m]))
  const subtreeIds = getSubtreeIds(memberId, membersMap)
  const myTeam = data.filter((m) => subtreeIds.has(m.id))
  const active = myTeam.filter((m) => m.report.is_active).length
  const totalBV = myTeam.reduce((sum, m) => sum + (m.report.monthly_bv ?? 0), 0)

  const me = data.find((m) => m.id === memberId)
  return `<b>Weekly Summary - ${month}</b>\n\n` +
    `สมาชิกในทีม: ${myTeam.length}\n` +
    `Active: ${active} (${myTeam.length > 0 ? Math.round((active / myTeam.length) * 100) : 0}%)\n` +
    `Total BV: ${totalBV.toLocaleString()}\n` +
    `Vol Left: ${(me?.report.total_vol_left ?? 0).toLocaleString()}\n` +
    `Vol Right: ${(me?.report.total_vol_right ?? 0).toLocaleString()}`
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
  return `<b>Re-engagement Alert ${month}</b>\n\nDownline ตรงที่ Inactive:\n${lines.slice(0, 20).join('\n')}${lines.length > 20 ? `\n... และอีก ${lines.length - 20} คน` : ''}\n\nลองติดต่อเพื่อกระตุ้นการทำงาน`
}

async function buildActivityMessage(memberId: string): Promise<string> {
  const activity = await getDailyActivityAnalysis(memberId)
  const alerts = activity.notifications.slice(0, 8)
  const lines = alerts.length > 0
    ? alerts.map((item) => `- ${item.title}: ${item.detail}`)
    : ['- ไม่มีงาน Follow-up ค้างหรือกิจกรรมที่ต้องแจ้งเตือนวันนี้']

  return (
    `<b>Coach JOE - Daily Action</b>\n\n` +
    `Weekly Score: ${activity.weeklyScorecard.score}/100 (${activity.weeklyScorecard.grade})\n` +
    `แผน 7 วัน: ทำแล้ว ${activity.planVsActual.completed7}/${activity.planVsActual.planned7} (${activity.planVsActual.completionPct ?? 0}%)\n` +
    `Funnel: Outreach ${activity.funnel.outreach} → นัด ${activity.funnel.appointments} → Meeting ${activity.funnel.meetings} → Sponsor ${activity.funnel.sponsors} → Start Up ${activity.funnel.startups}\n\n` +
    `${lines.join('\n')}\n\n` +
    `Priority: ${activity.weeklyScorecard.summary}`
  )
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type } = body as { type: TelegramNotificationType }

    if (!type || !['activity', 'keyman', 'watchlist', 'leaderboard', 'weekly', 'wakeup'].includes(type)) {
      return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 })
    }

    const config = await loadTelegramConfigs()
    const memberConfig = config[session.memberId]

    if (!memberConfig || !memberConfig.enabled) {
      return NextResponse.json({ error: 'Telegram not configured or disabled' }, { status: 400 })
    }

    const botToken = getTelegramBotToken(config, session.memberId)
    if (!botToken) {
      return NextResponse.json({ error: 'No bot token configured' }, { status: 400 })
    }

    let message: string
    switch (type) {
      case 'activity':
        message = await buildActivityMessage(session.memberId)
        break
      case 'keyman':
        message = await buildKeymanGoalAlertMessage(session.memberId)
        break
      case 'watchlist':
        message = await buildWatchlistMessage(session.memberId)
        break
      case 'leaderboard':
        message = await buildLeaderboardMessage()
        break
      case 'weekly':
        message = await buildWeeklyMessage(session.memberId)
        break
      case 'wakeup':
        message = await buildWakeupMessage(session.memberId)
        break
    }

    const success = await sendTelegramMessage(memberConfig.chatId, message, botToken)

    if (!success) {
      return NextResponse.json({ error: 'Failed to send telegram message' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}
