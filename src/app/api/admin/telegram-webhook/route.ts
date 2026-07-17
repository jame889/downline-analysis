import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { loadTelegramConfigs } from '@/lib/telegram-config'

export const dynamic = 'force-dynamic'

const WEBHOOK_URL = 'https://downline-analyzer.vercel.app/api/telegram/webhook'

async function botRequest(token: string, method: string, body?: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const result = await response.json() as { ok?: boolean; result?: unknown; description?: string }
  if (!response.ok || !result.ok) throw new Error(result.description ?? `Telegram ${method} failed`)
  return result.result
}

async function adminBotToken(): Promise<string> {
  const rootId = process.env.NEXT_PUBLIC_ROOT_MEMBER_ID ?? '900057'
  const configs = await loadTelegramConfigs()
  const token = configs[rootId]?.botToken ?? process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('Telegram bot token is not configured')
  return token
}

export async function GET() {
  const session = await getSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  try {
    const info = await botRequest(await adminBotToken(), 'getWebhookInfo')
    return NextResponse.json({ ok: true, info })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to read webhook' }, { status: 500 })
  }
}

export async function POST() {
  const session = await getSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'TELEGRAM_WEBHOOK_SECRET is missing' }, { status: 503 })

  try {
    const token = await adminBotToken()
    const webhook = await botRequest(token, 'setWebhook', {
      url: WEBHOOK_URL,
      secret_token: secret,
      allowed_updates: ['message'],
      drop_pending_updates: false,
    })
    const commands = await botRequest(token, 'setMyCommands', {
      commands: [
        { command: 'coach', description: 'คุยกับ Coach JOE' },
        { command: 'activity', description: 'บันทึกกิจกรรมรายวัน' },
        { command: 'today', description: 'ดูกิจกรรมวันนี้' },
        { command: 'score', description: 'ดู Weekly Score' },
        { command: 'followup', description: 'ดูงานติดตาม' },
        { command: 'undo', description: 'ยกเลิกรายการล่าสุด' },
        { command: 'help', description: 'วิธีใช้งาน' },
      ],
    })
    const info = await botRequest(token, 'getWebhookInfo')
    return NextResponse.json({ ok: true, webhook, commands, info })
  } catch (error) {
    console.error('[telegram-webhook-setup]', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook setup failed' }, { status: 500 })
  }
}
