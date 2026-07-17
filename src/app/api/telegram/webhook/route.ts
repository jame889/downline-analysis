import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  ACTIVITY_TYPE_LABELS,
  deleteDailyActivity,
  getDailyActivityAnalysis,
  loadDailyActivities,
  saveDailyActivity,
} from '@/lib/daily-activities'
import { activityHelp, formatActivityConfirmation, parseTelegramActivity } from '@/lib/telegram-activity'
import {
  appendTelegramConversation,
  claimTelegramUpdate,
  getLastTelegramActivity,
  getTelegramConversation,
  setLastTelegramActivity,
} from '@/lib/telegram-bot-state'
import { buildTelegramCoachReply } from '@/lib/telegram-coach'
import { loadTelegramConfigs } from '@/lib/telegram-config'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface TelegramUpdate {
  update_id?: number
  message?: {
    message_id?: number
    text?: string
    chat?: { id?: number | string; type?: string }
  }
}

async function telegramCall(
  token: string,
  method: string,
  body: Record<string, unknown>
): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const result = await response.json() as { ok?: boolean; description?: string }
    if (!result.ok) console.warn(`[telegram-webhook] ${method} failed: ${result.description ?? response.status}`)
    return result.ok === true
  } catch (error) {
    console.warn(`[telegram-webhook] ${method} request failed`, error)
    return false
  }
}

async function sendText(token: string, chatId: string, text: string): Promise<boolean> {
  const clean = text.trim() || 'ไม่พบข้อมูล'
  const chunks: string[] = []
  let remaining = clean
  while (remaining.length > 3900) {
    let splitAt = remaining.lastIndexOf('\n', 3900)
    if (splitAt < 1000) splitAt = 3900
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }
  chunks.push(remaining)
  let sent = true
  for (const chunk of chunks) {
    sent = await telegramCall(token, 'sendMessage', {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
    }) && sent
  }
  return sent
}

function webhookAuthorized(request: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET ?? ''
  const supplied = request.headers.get('x-telegram-bot-api-secret-token') ?? ''
  if (!expected || !supplied || expected.length !== supplied.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
}

function helpMessage(): string {
  return [
    'Coach JOE พร้อมใช้งานแล้ว',
    '',
    'พิมพ์คำถามได้ทันที เช่น:',
    'จะขึ้น Diamond ต้องทำงานกับใคร',
    'วันนี้ควรโฟกัสสายไหน',
    '',
    'คำสั่ง:',
    '/activity บันทึกกิจกรรม',
    '/today กิจกรรมวันนี้',
    '/score Weekly Score',
    '/followup งานติดตาม',
    '/undo ยกเลิกรายการล่าสุด',
    '/help วิธีใช้งาน',
    '',
    activityHelp(),
  ].join('\n')
}

function bangkokToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

async function todayMessage(memberId: string): Promise<string> {
  const today = bangkokToday()
  const activities = Object.values(await loadDailyActivities())
    .filter((item) => item.memberId === memberId && item.date === today && item.status !== 'cancelled')
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
  if (!activities.length) return `วันนี้ (${today}) ยังไม่มีกิจกรรมที่บันทึกไว้`
  return [
    `กิจกรรมวันนี้ ${today}`,
    ...activities.slice(0, 12).map((item, index) =>
      `${index + 1}. ${item.startTime} ${ACTIVITY_TYPE_LABELS[item.type]} · ซ้าย ${item.leftCount} ขวา ${item.rightCount} · ${item.status === 'completed' ? 'ทำแล้ว' : 'วางแผน'}`
    ),
  ].join('\n')
}

async function scoreMessage(memberId: string): Promise<string> {
  const analysis = await getDailyActivityAnalysis(memberId)
  return [
    `Weekly Score ${analysis.weeklyScorecard.score}/100 (${analysis.weeklyScorecard.grade})`,
    `Consistency ${analysis.weeklyScorecard.consistencyScore}/25`,
    `Conversion ${analysis.weeklyScorecard.conversionScore}/25`,
    `Weak Leg ${analysis.weeklyScorecard.weakLegScore}/20`,
    `Sponsor ${analysis.weeklyScorecard.sponsorScore}/15`,
    `Start Up ${analysis.weeklyScorecard.startupScore}/15`,
    '',
    `Funnel: Outreach ${analysis.funnel.outreach} → นัด ${analysis.funnel.appointments} → Meeting ${analysis.funnel.meetings} → Sponsor ${analysis.funnel.sponsors} → Start Up ${analysis.funnel.startups}`,
    `Priority: ${analysis.weeklyScorecard.summary}`,
  ].join('\n')
}

async function followUpMessage(memberId: string): Promise<string> {
  const analysis = await getDailyActivityAnalysis(memberId)
  const items = analysis.notifications.filter((item) => item.id.startsWith('followup-'))
  if (!items.length) return 'ไม่มีงาน Follow-up ที่ถึงกำหนดครับ'
  return [
    `งาน Follow-up ${items.length} รายการ`,
    ...items.slice(0, 10).map((item, index) => `${index + 1}. ${item.title} · ${item.detail}`),
  ].join('\n')
}

async function handleMessage(token: string, chatId: string, memberId: string, rawText: string): Promise<void> {
  const text = rawText.trim()
  const command = text.split(/\s+/, 1)[0].toLowerCase().replace(/@\w+$/, '')

  if (command === '/start' || command === '/help') {
    await sendText(token, chatId, helpMessage())
    return
  }
  if (command === '/today') {
    await sendText(token, chatId, await todayMessage(memberId))
    return
  }
  if (command === '/score') {
    await sendText(token, chatId, await scoreMessage(memberId))
    return
  }
  if (command === '/followup') {
    await sendText(token, chatId, await followUpMessage(memberId))
    return
  }
  if (command === '/undo') {
    const activityId = await getLastTelegramActivity(memberId)
    if (!activityId || !(await deleteDailyActivity(activityId, memberId))) {
      await sendText(token, chatId, 'ไม่มีรายการล่าสุดจาก Telegram ให้ยกเลิกครับ')
      return
    }
    await setLastTelegramActivity(memberId, null)
    await sendText(token, chatId, 'ยกเลิกรายการล่าสุดเรียบร้อยแล้ว')
    return
  }

  const activity = parseTelegramActivity(memberId, text)
  if (activity) {
    await saveDailyActivity(activity)
    await setLastTelegramActivity(memberId, activity.id)
    await sendText(token, chatId, formatActivityConfirmation(activity))
    return
  }
  if (command === '/activity') {
    await sendText(token, chatId, activityHelp())
    return
  }

  await telegramCall(token, 'sendChatAction', { chat_id: chatId, action: 'typing' })
  const history = await getTelegramConversation(memberId)
  const reply = await buildTelegramCoachReply(memberId, text.replace(/^\/coach(?:@\w+)?\s*/i, ''), history)
  await appendTelegramConversation(memberId, [
    { role: 'user', content: text },
    { role: 'assistant', content: reply },
  ])
  await sendText(token, chatId, reply)
}

export async function POST(request: NextRequest) {
  if (!webhookAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const update = await request.json() as TelegramUpdate
    const updateId = String(update.update_id ?? '')
    const chatId = String(update.message?.chat?.id ?? '')
    const text = update.message?.text?.trim() ?? ''
    if (!updateId || !chatId || !text) return NextResponse.json({ ok: true, ignored: true })
    if (!(await claimTelegramUpdate(updateId))) return NextResponse.json({ ok: true, duplicate: true })

    const configs = await loadTelegramConfigs()
    const rootId = process.env.NEXT_PUBLIC_ROOT_MEMBER_ID ?? '900057'
    const ownerToken = configs[rootId]?.botToken ?? process.env.TELEGRAM_BOT_TOKEN
    if (!ownerToken) throw new Error('Telegram bot token is not configured')

    const matched = Object.entries(configs).find(([, config]) => config.enabled && config.chatId === chatId)
    if (!matched) {
      await sendText(ownerToken, chatId, 'Chat ID นี้ยังไม่ได้เชื่อมกับ Downline Analyzer กรุณาเข้าสู่ระบบแล้วตั้งค่าที่เมนู Telegram')
      return NextResponse.json({ ok: true, linked: false })
    }

    await handleMessage(ownerToken, chatId, matched[0], text)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[telegram-webhook]', error)
    return NextResponse.json({ error: 'Telegram webhook failed' }, { status: 500 })
  }
}
