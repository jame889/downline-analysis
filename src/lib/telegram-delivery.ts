import { createHash, randomUUID } from 'crypto'
import { hasSupabase, sbInsert, sbPatch, sbSelect, SupabaseError } from './supabase'

export type DeliveryState = 'pending' | 'sent' | 'failed' | 'unknown'
interface DeliveryRow {
  delivery_key: string; state: DeliveryState; attempt_id: string; telegram_message_id?: number | null
}
export interface DeliveryResult {
  success: boolean; state: DeliveryState | 'already_sent'; error?: string; messageId?: number
}
export async function sendTelegramWithReceipt(chatId: string, text: string, token: string): Promise<DeliveryResult> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      cache: 'no-store', signal: AbortSignal.timeout(12000),
    })
    const body = await response.json() as { ok?: boolean; error_code?: number; result?: { message_id?: number } }
    if (response.ok && body.ok === true && Number.isSafeInteger(body.result?.message_id)) {
      return { success: true, state: 'sent', messageId: body.result!.message_id }
    }
    if (response.status < 500 && body.ok === false) {
      return { success: false, state: 'failed', error: `telegram_rejected_${body.error_code ?? response.status}` }
    }
    return { success: false, state: 'unknown', error: 'telegram_response_unconfirmed' }
  } catch {
    return { success: false, state: 'unknown', error: 'telegram_delivery_unconfirmed' }
  }
}
export async function sendScheduledTelegram(input: {
  memberId: string; chatId: string; token: string; type: string; sourceVersion: string; message: string
}): Promise<DeliveryResult> {
  if (!hasSupabase()) return { success: false, state: 'failed', error: 'durable_delivery_store_required' }
  const key = createHash('sha256').update(JSON.stringify([
    input.memberId, input.chatId, input.type, input.sourceVersion,
  ])).digest('hex')
  const attemptId = randomUUID()
  const filter = `delivery_key=eq.${key}`
  try {
    try {
      await sbInsert('telegram_deliveries', {
        delivery_key: key, member_id: input.memberId, notification_type: input.type,
        source_version: input.sourceVersion, state: 'pending', attempt_id: attemptId,
      })
    } catch (error) {
      if (!(error instanceof SupabaseError && error.code === '23505')) throw error
      const existing = (await sbSelect<DeliveryRow>('telegram_deliveries', `${filter}&select=*&limit=1`))[0]
      if (existing?.state === 'sent') return { success: true, state: 'already_sent', messageId: existing.telegram_message_id ?? undefined }
      // Never automatically resend a timeout or crashed in-flight request.
      if (existing?.state !== 'failed') return { success: false, state: existing?.state ?? 'unknown', error: 'delivery_needs_review' }
      const claimed = await sbPatch<DeliveryRow>('telegram_deliveries', `${filter}&state=eq.failed&attempt_id=eq.${existing.attempt_id}`, {
        state: 'pending', attempt_id: attemptId, error_code: null, updated_at: new Date().toISOString(),
      })
      if (claimed.length !== 1) return { success: false, state: 'pending', error: 'delivery_in_progress' }
    }
  } catch {
    return { success: false, state: 'failed', error: 'delivery_store_unavailable' }
  }
  const sent = await sendTelegramWithReceipt(input.chatId, input.message, input.token)
  try {
    const saved = await sbPatch<DeliveryRow>('telegram_deliveries', `${filter}&attempt_id=eq.${attemptId}&state=eq.pending`, {
      state: sent.state, telegram_message_id: sent.messageId ?? null,
      error_code: sent.error ?? null, updated_at: new Date().toISOString(),
    })
    if (saved.length !== 1) throw new Error('Receipt write lost')
    return sent
  } catch {
    return { success: false, state: 'unknown', error: 'delivery_receipt_unconfirmed' }
  }
}
