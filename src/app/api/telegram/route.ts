import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  DEFAULT_TELEGRAM_NOTIFICATIONS,
  TELEGRAM_NOTIFICATION_TYPES,
  configureTelegramBot,
  getTelegramBotToken,
  loadTelegramConfigs,
  updateTelegramConfig,
  type TelegramNotificationType,
} from '@/lib/telegram-config'

export const dynamic = 'force-dynamic'

function safeNotifications(value: unknown): Partial<Record<TelegramNotificationType, boolean>> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  return Object.fromEntries(
    TELEGRAM_NOTIFICATION_TYPES
      .filter((type) => typeof source[type] === 'boolean')
      .map((type) => [type, source[type] as boolean])
  )
}

async function validateTelegramConnection(botToken: string, chatId: string): Promise<string | null> {
  try {
    const [botResponse, chatResponse] = await Promise.all([
      fetch(`https://api.telegram.org/bot${botToken}/getMe`, { cache: 'no-store' }),
      fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${encodeURIComponent(chatId)}`, { cache: 'no-store' }),
    ])
    const [botResult, chatResult] = await Promise.all([botResponse.json(), chatResponse.json()])
    if (!botResult.ok) return 'Bot Token ไม่ถูกต้อง'
    if (!chatResult.ok) return 'Chat ID ไม่ถูกต้อง หรือยังไม่ได้กด /start กับ Bot'
    return null
  } catch {
    return 'ไม่สามารถตรวจสอบกับ Telegram ได้ กรุณาลองใหม่'
  }
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const configs = await loadTelegramConfigs()
    const config = configs[session.memberId] ?? null
    const sharedBotToken = getTelegramBotToken(configs)
    return NextResponse.json({
      configured: Boolean(config?.chatId && config.enabled),
      globalBotAvailable: Boolean(sharedBotToken),
      config: config
        ? {
            chatId: config.chatId,
            enabled: config.enabled,
            createdAt: config.createdAt,
            notifications: { ...DEFAULT_TELEGRAM_NOTIFICATIONS, ...config.notifications },
            hasBotToken: Boolean(getTelegramBotToken(configs, session.memberId)),
          }
        : null,
    })
  } catch (error) {
    console.error('[telegram] Failed to load config', error)
    return NextResponse.json({ error: 'Failed to load telegram config' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const chatId = String(body.chatId ?? '').trim().slice(0, 100)
    if (!chatId) return NextResponse.json({ error: 'chatId is required' }, { status: 400 })

    const botToken = typeof body.botToken === 'string' ? body.botToken.trim().slice(0, 300) : undefined
    const configs = await loadTelegramConfigs()
    const effectiveBotToken = botToken || getTelegramBotToken(configs, session.memberId)
    if (!effectiveBotToken) {
      return NextResponse.json({ error: 'กรุณาระบุ Bot Token' }, { status: 400 })
    }
    const connectionError = await validateTelegramConnection(effectiveBotToken, chatId)
    if (connectionError) return NextResponse.json({ error: connectionError }, { status: 400 })
    if (botToken) {
      const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? ''
      if (!webhookSecret) {
        return NextResponse.json({ error: 'ระบบ Telegram webhook ยังไม่พร้อม' }, { status: 503 })
      }
      try {
        await configureTelegramBot(botToken, webhookSecret)
      } catch (error) {
        return NextResponse.json({
          error: error instanceof Error ? error.message : 'ตั้งค่า Telegram webhook ไม่สำเร็จ',
        }, { status: 400 })
      }
    }

    const config = await updateTelegramConfig(session.memberId, {
      chatId,
      ...(botToken !== undefined ? { botToken } : {}),
      enabled: body.enabled !== false,
      notifications: safeNotifications(body.notifications),
    })

    return NextResponse.json({
      success: true,
      config: {
        chatId: config.chatId,
        enabled: config.enabled,
        createdAt: config.createdAt,
        notifications: { ...DEFAULT_TELEGRAM_NOTIFICATIONS, ...config.notifications },
        hasBotToken: Boolean(getTelegramBotToken({ ...configs, [session.memberId]: config }, session.memberId)),
      },
    })
  } catch (error) {
    console.error('[telegram] Failed to save config', error)
    return NextResponse.json({ error: 'Failed to save telegram config' }, { status: 500 })
  }
}
