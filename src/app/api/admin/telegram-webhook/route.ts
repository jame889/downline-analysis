import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  configureTelegramBot,
  loadTelegramConfigs,
  telegramBotRequest,
} from '@/lib/telegram-config'

export const dynamic = 'force-dynamic'

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
    const info = await telegramBotRequest(await adminBotToken(), 'getWebhookInfo')
    return NextResponse.json({ ok: true, info })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to read webhook' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'TELEGRAM_WEBHOOK_SECRET is missing' }, { status: 503 })

  try {
    const body = await request.json().catch(() => ({})) as { dropPending?: boolean }
    const token = await adminBotToken()
    const info = await configureTelegramBot(token, secret, body.dropPending === true)
    return NextResponse.json({ ok: true, webhook: true, commands: true, info })
  } catch (error) {
    console.error('[telegram-webhook-setup]', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook setup failed' }, { status: 500 })
  }
}
