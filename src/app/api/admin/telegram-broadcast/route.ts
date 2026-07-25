import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { buildTelegramActivityMessage } from '@/lib/telegram-activity-message'
import {
  getTelegramBotToken,
  loadTelegramConfigs,
  notificationEnabled,
  sendTelegramMessage,
} from '@/lib/telegram-config'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface BroadcastResult {
  memberId: string
  success: boolean
  error?: string
}

async function authorized(request: NextRequest): Promise<boolean> {
  const session = await getSession()
  if (session?.isAdmin) return true

  const secret = process.env.BUSINESS_REPORT_SYNC_SECRET ?? ''
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!secret || !supplied || secret.length !== supplied.length) return false
  return timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))
}

export async function POST(request: NextRequest) {
  if (!(await authorized(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { type?: string }
  if (body.type !== 'activity') {
    return NextResponse.json({ error: 'Invalid broadcast type' }, { status: 400 })
  }

  const configs = await loadTelegramConfigs()
  const targets = Object.entries(configs).filter(([, config]) =>
    config.enabled && notificationEnabled(config, 'activity')
  )
  const results: BroadcastResult[] = []

  for (let offset = 0; offset < targets.length; offset += 5) {
    const batch = targets.slice(offset, offset + 5)
    const batchResults = await Promise.all(batch.map(async ([memberId, config]): Promise<BroadcastResult> => {
      const botToken = getTelegramBotToken(configs, memberId)
      if (!botToken) return { memberId, success: false, error: 'No bot token' }

      try {
        const message = await buildTelegramActivityMessage(memberId)
        const success = await sendTelegramMessage(config.chatId, message, botToken)
        return { memberId, success, ...(!success ? { error: 'Telegram send failed' } : {}) }
      } catch (error) {
        return {
          memberId,
          success: false,
          error: error instanceof Error ? error.message : 'Broadcast failed',
        }
      }
    }))
    results.push(...batchResults)
  }

  const sent = results.filter((result) => result.success).length
  console.log(`[Admin Telegram Broadcast] activity: sent ${sent}/${results.length}`)
  return NextResponse.json({
    ok: sent === results.length,
    type: 'activity',
    sent,
    total: results.length,
    failed: results.length - sent,
    results,
  }, { status: sent === results.length ? 200 : 207 })
}
