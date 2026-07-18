import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  configureTelegramBot,
  loadTelegramConfigs,
  telegramBotRequest,
  type TelegramConfigStore,
} from '@/lib/telegram-config'

export const dynamic = 'force-dynamic'

interface BotTarget {
  token: string
  memberIds: string[]
}

interface TelegramBotIdentity {
  id: number
  username?: string
  first_name: string
}

function botTargets(configs: TelegramConfigStore): BotTarget[] {
  const rootId = process.env.NEXT_PUBLIC_ROOT_MEMBER_ID ?? '900057'
  const targets = new Map<string, string[]>()
  const add = (token: string | undefined, memberId: string) => {
    if (!token) return
    targets.set(token, [...(targets.get(token) ?? []), memberId])
  }

  for (const [memberId, config] of Object.entries(configs)) add(config.botToken, memberId)
  if (!configs[rootId]?.botToken) add(process.env.TELEGRAM_BOT_TOKEN, rootId)
  return Array.from(targets, ([token, memberIds]) => ({ token, memberIds }))
}

async function botStatus(target: BotTarget) {
  try {
    const [bot, info] = await Promise.all([
      telegramBotRequest<TelegramBotIdentity>(target.token, 'getMe'),
      telegramBotRequest<Record<string, unknown>>(target.token, 'getWebhookInfo'),
    ])
    return {
      ok: true,
      memberIds: target.memberIds,
      bot: { id: bot.id, username: bot.username, name: bot.first_name },
      info,
    }
  } catch (error) {
    return {
      ok: false,
      memberIds: target.memberIds,
      error: error instanceof Error ? error.message : 'Unable to read webhook',
    }
  }
}

export async function GET() {
  const session = await getSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  try {
    const targets = botTargets(await loadTelegramConfigs())
    const bots = await Promise.all(targets.map(botStatus))
    return NextResponse.json({
      ok: bots.every((bot) => bot.ok),
      total: bots.length,
      healthy: bots.filter((bot) => bot.ok).length,
      bots,
    })
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
    const targets = botTargets(await loadTelegramConfigs())
    const bots = []
    for (const target of targets) {
      try {
        await configureTelegramBot(target.token, secret, body.dropPending === true)
        bots.push(await botStatus(target))
      } catch (error) {
        bots.push({
          ok: false,
          memberIds: target.memberIds,
          error: error instanceof Error ? error.message : 'Webhook setup failed',
        })
      }
    }

    const configured = bots.filter((bot) => bot.ok).length
    return NextResponse.json({
      ok: configured === bots.length,
      total: bots.length,
      configured,
      failed: bots.length - configured,
      bots,
    }, { status: configured === bots.length ? 200 : 207 })
  } catch (error) {
    console.error('[telegram-webhook-setup]', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook setup failed' }, { status: 500 })
  }
}
