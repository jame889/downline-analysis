import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getSession, ROOT_MEMBER_ID } from '@/lib/auth'
import { getAvailableMonths, getMembersForMonth, getMember, getSubtreeIds } from '@/lib/db'

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

async function sendTelegramMessage(
  chatId: string,
  text: string,
  botToken: string
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    })
    const result = await res.json()
    return result.ok === true
  } catch {
    return false
  }
}

function buildWatchlistMessage(memberId: string): string {
  const months = getAvailableMonths().slice().sort()
  if (months.length < 2) return 'ไม่มีข้อมูลเพียงพอสำหรับ Watchlist'

  const currentMonth = months[months.length - 1]
  const prevMonth = months[months.length - 2]
  const current = getMembersForMonth(currentMonth)
  const prev = getMembersForMonth(prevMonth)
  const subtreeIds = getSubtreeIds(memberId)

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

function buildLeaderboardMessage(): string {
  const months = getAvailableMonths().slice().sort()
  const month = months[months.length - 1]
  if (!month) return 'ไม่มีข้อมูล'

  const data = getMembersForMonth(month)
  const topBV = data
    .slice()
    .sort((a, b) => (b.report.monthly_bv ?? 0) - (a.report.monthly_bv ?? 0))
    .slice(0, 5)

  const lines = topBV.map((m, i) => `${i + 1}. ${m.name} - BV: ${(m.report.monthly_bv ?? 0).toLocaleString()}`)
  return `<b>Top 5 BV - ${month}</b>\n\n${lines.join('\n')}`
}

function buildWeeklyMessage(memberId: string): string {
  const months = getAvailableMonths().slice().sort()
  const month = months[months.length - 1]
  if (!month) return 'ไม่มีข้อมูล'

  const data = getMembersForMonth(month)
  const subtreeIds = getSubtreeIds(memberId)
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

function buildWakeupMessage(memberId: string): string {
  const months = getAvailableMonths().slice().sort()
  const month = months[months.length - 1]
  if (!month) return 'ไม่มีข้อมูล'

  const data = getMembersForMonth(month)
  const subtreeIds = getSubtreeIds(memberId)
  const inactive = data.filter((m) => subtreeIds.has(m.id) && !m.report.is_active && m.upline_id === memberId)

  if (inactive.length === 0) return `<b>Re-engagement ${month}</b>\n\nDownline ตรงทุกคน Active อยู่`

  const lines = inactive.map((m) => `- ${m.name} (${m.id})`)
  return `<b>Re-engagement Alert ${month}</b>\n\nDownline ตรงที่ Inactive:\n${lines.slice(0, 20).join('\n')}${lines.length > 20 ? `\n... และอีก ${lines.length - 20} คน` : ''}\n\nลองติดต่อเพื่อกระตุ้นการทำงาน`
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type } = body as { type: 'watchlist' | 'leaderboard' | 'weekly' | 'wakeup' }

    if (!type || !['watchlist', 'leaderboard', 'weekly', 'wakeup'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type. Must be: watchlist, leaderboard, weekly, wakeup' }, { status: 400 })
    }

    const config = loadTelegramConfig()
    const memberConfig = config[session.memberId]

    if (!memberConfig || !memberConfig.enabled) {
      return NextResponse.json({ error: 'Telegram not configured or disabled' }, { status: 400 })
    }

    const botToken = memberConfig.botToken ?? process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return NextResponse.json({ error: 'No bot token configured' }, { status: 400 })
    }

    let message: string
    switch (type) {
      case 'watchlist':
        message = buildWatchlistMessage(session.memberId)
        break
      case 'leaderboard':
        message = buildLeaderboardMessage()
        break
      case 'weekly':
        message = buildWeeklyMessage(session.memberId)
        break
      case 'wakeup':
        message = buildWakeupMessage(session.memberId)
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
