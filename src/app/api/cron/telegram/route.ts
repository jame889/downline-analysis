import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { ROOT_MEMBER_ID } from '@/lib/auth'
import { getAvailableMonths, getMembersForMonth, getSubtreeIds } from '@/lib/db'
import { getDailyActivityAnalysis } from '@/lib/daily-activities'

export const dynamic = 'force-dynamic'

const DATA_DIR = path.join(process.cwd(), 'data')
const TELEGRAM_FILE = path.join(DATA_DIR, 'telegram.json')

interface TelegramConfig {
  chatId: string
  botToken?: string
  enabled: boolean
  createdAt: string
}

function loadTelegramConfig(): Record<string, TelegramConfig> {
  if (!fs.existsSync(TELEGRAM_FILE)) return {}
  return JSON.parse(fs.readFileSync(TELEGRAM_FILE, 'utf-8'))
}

async function sendTelegramMessage(chatId: string, text: string, botToken: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
    const result = await res.json()
    return result.ok === true
  } catch {
    return false
  }
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

  return (
    `<b>Weekly Summary - ${month}</b>\n\n` +
    `สมาชิกในทีม: ${myTeam.length}\n` +
    `Active: ${active} (${myTeam.length > 0 ? Math.round((active / myTeam.length) * 100) : 0}%)\n` +
    `Total BV: ${totalBV.toLocaleString()}\n` +
    `Vol Left: ${(me?.report.total_vol_left ?? 0).toLocaleString()}\n` +
    `Vol Right: ${(me?.report.total_vol_right ?? 0).toLocaleString()}`
  )
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

// Map cron type to notification type and day description
const CRON_SCHEDULES: Record<string, { type: 'weekly' | 'wakeup' | 'watchlist' | 'activity'; label: string }> = {
  weekly: { type: 'weekly', label: 'Weekly Report (จันทร์ 8:00)' },
  wakeup: { type: 'wakeup', label: 'Wakeup Alert (อังคาร-ศุกร์ 9:00)' },
  watchlist: { type: 'watchlist', label: 'Watchlist (อาทิตย์ 10:00)' },
  activity: { type: 'activity', label: 'Daily Activity (ทุกวัน 8:00)' },
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
    return NextResponse.json({ error: 'Invalid cron type. Use: weekly, wakeup, watchlist' }, { status: 400 })
  }

  const allConfigs = loadTelegramConfig()
  const globalBotToken = process.env.TELEGRAM_BOT_TOKEN

  const results: { memberId: string; success: boolean; error?: string }[] = []

  for (const [memberId, config] of Object.entries(allConfigs)) {
    if (!config.enabled) continue

    const botToken = config.botToken ?? globalBotToken
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
        message = await buildActivityMessage(memberId)
        break
    }

    const success = await sendTelegramMessage(config.chatId, message, botToken)
    results.push({ memberId, success })
  }

  const sent = results.filter((r) => r.success).length
  console.log(`[Cron Telegram] ${schedule.label}: sent ${sent}/${results.length}`)

  return NextResponse.json({ ok: true, type: cronType, sent, total: results.length, results })
}
