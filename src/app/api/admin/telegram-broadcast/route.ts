import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { buildTelegramActivityMessage } from '@/lib/telegram-activity-message'
import { buildKeymanGoalAlertMessage } from '@/lib/telegram-keyman-alert'
import { formatTelegramWeeklySummary, getTelegramWeeklySummary } from '@/lib/telegram-weekly-summary'
import { getTelegramBotToken, loadTelegramConfigs, notificationEnabled, type TelegramNotificationType } from '@/lib/telegram-config'
import { sendScheduledTelegram } from '@/lib/telegram-delivery'
import { getFreshReport } from '@/lib/report-freshness'
import { withDataRequest } from '@/lib/data-request'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
async function authorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.BUSINESS_REPORT_SYNC_SECRET ?? ''
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (secret && supplied && Buffer.byteLength(secret) === Buffer.byteLength(supplied)
    && timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) return true
  return (await getSession())?.isAdmin === true
}
export async function POST(request: NextRequest) {
  if (!await authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({})) as { type?: string }
  if (!['activity', 'report'].includes(body.type ?? '')) return NextResponse.json({ error: 'Invalid broadcast type' }, { status: 400 })
  return withDataRequest(async () => {
    try {
      const { sourceVersion } = await getFreshReport()
      const configs = await loadTelegramConfigs()
      const monday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', weekday: 'short' }).format(new Date()) === 'Mon'
      const types: TelegramNotificationType[] = body.type === 'report' ? ['activity', 'keyman', ...(monday ? ['weekly' as const] : [])] : ['activity']
      const targets = Object.entries(configs).flatMap(([memberId, config]) => types
        .filter(type => config.enabled && notificationEnabled(config, type))
        .map(type => ({ memberId, config, type })))
      const results = []
      for (let offset = 0; offset < targets.length; offset += 3) {
        results.push(...await Promise.all(targets.slice(offset, offset + 3).map(async ({ memberId, config, type }) => {
          const token = getTelegramBotToken(configs, memberId)
          if (!token) return { memberId, type, success: false, state: 'failed', error: 'missing_bot_token' }
          try {
            let message: string
            if (type === 'weekly') {
              const weekly = await getTelegramWeeklySummary(memberId)
              if (!weekly) throw new Error('Missing weekly report')
              message = formatTelegramWeeklySummary(weekly)
            } else message = type === 'keyman' ? await buildKeymanGoalAlertMessage(memberId) : await buildTelegramActivityMessage(memberId)
            return { memberId, type, ...await sendScheduledTelegram({ memberId, chatId: config.chatId, token, type, sourceVersion, message }) }
          } catch { return { memberId, type, success: false, state: 'failed', error: 'message_build_failed' } }
        })))
      }
      const sent = results.filter(r => r.state === 'sent').length
      const skipped = results.filter(r => r.state === 'already_sent').length
      const failed = results.filter(r => !r.success).length
      return NextResponse.json({ ok: failed === 0, type: body.type, sent, skipped, total: results.length, failed, results }, { status: failed ? 207 : 200 })
    } catch {
      return NextResponse.json({ ok: false, error: 'Fresh complete Business Report and delivery store are required' }, { status: 503 })
    }
  })
}
