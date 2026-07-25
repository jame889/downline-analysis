import fs from 'fs'
import path from 'path'
import { hasSupabase, sbSelect, sbUpsert } from './supabase'

const LOCAL_PATH = path.join(process.cwd(), 'data', 'telegram.json')
const TELEGRAM_WEBHOOK_URL = 'https://downline-analyzer.vercel.app/api/telegram/webhook'

const TELEGRAM_COMMANDS = [
  { command: 'coach', description: 'คุยกับ Coach JOE' },
  { command: 'activity', description: 'บันทึกกิจกรรมรายวัน' },
  { command: 'today', description: 'ดูกิจกรรมวันนี้' },
  { command: 'score', description: 'ดู Weekly Score และ Keyman' },
  { command: 'keyman', description: 'วิเคราะห์ Placement ซ้าย-ขวา' },
  { command: 'followup', description: 'ดูงานติดตาม' },
  { command: 'undo', description: 'ยกเลิกรายการล่าสุด' },
  { command: 'help', description: 'วิธีใช้งาน' },
]

export const TELEGRAM_NOTIFICATION_TYPES = ['activity', 'keyman', 'weekly', 'watchlist', 'leaderboard', 'wakeup'] as const
export type TelegramNotificationType = (typeof TELEGRAM_NOTIFICATION_TYPES)[number]

export const DEFAULT_TELEGRAM_NOTIFICATIONS: Record<TelegramNotificationType, boolean> = {
  activity: true,
  keyman: true,
  weekly: true,
  watchlist: true,
  leaderboard: true,
  wakeup: false,
}

export interface TelegramConfig {
  chatId: string
  botToken?: string
  enabled: boolean
  createdAt: string
  updatedAt?: string
  notifications?: Partial<Record<TelegramNotificationType, boolean>>
}

export type TelegramConfigStore = Record<string, TelegramConfig>

interface TelegramConfigRow {
  member_id: string
  chat_id: string
  bot_token?: string | null
  enabled: boolean
  notifications?: Partial<Record<TelegramNotificationType, boolean>> | null
  created_at: string
  updated_at?: string | null
}

export function getTelegramBotToken(configs: TelegramConfigStore, memberId?: string): string | undefined {
  const rootId = process.env.NEXT_PUBLIC_ROOT_MEMBER_ID ?? '900057'
  return (memberId ? configs[memberId]?.botToken : undefined)
    ?? configs[rootId]?.botToken
    ?? process.env.TELEGRAM_BOT_TOKEN
}

export async function telegramBotRequest<T = unknown>(
  token: string,
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const result = await response.json() as { ok?: boolean; result?: T; description?: string }
  if (!response.ok || !result.ok) throw new Error(result.description ?? `Telegram ${method} failed`)
  return result.result as T
}

export async function configureTelegramBot(
  token: string,
  secret: string,
  dropPending = false
): Promise<unknown> {
  await telegramBotRequest(token, 'setWebhook', {
    url: TELEGRAM_WEBHOOK_URL,
    secret_token: secret,
    allowed_updates: ['message'],
    max_connections: 1,
    drop_pending_updates: dropPending,
  })
  await telegramBotRequest(token, 'setMyCommands', { commands: TELEGRAM_COMMANDS })
  return telegramBotRequest(token, 'getWebhookInfo')
}

function readLocal(): TelegramConfigStore {
  try {
    if (!fs.existsSync(LOCAL_PATH)) return {}
    return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf-8')) as TelegramConfigStore
  } catch {
    return {}
  }
}

function writeLocal(values: TelegramConfigStore): void {
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true })
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(values, null, 2), 'utf-8')
}

export async function loadTelegramConfigs(): Promise<TelegramConfigStore> {
  if (!hasSupabase()) return readLocal()
  try {
    const rows = await sbSelect<TelegramConfigRow>('telegram_configs', 'select=*')
    return Object.fromEntries(rows.map((row) => [row.member_id, {
      chatId: row.chat_id,
      ...(row.bot_token ? { botToken: row.bot_token } : {}),
      enabled: row.enabled,
      notifications: row.notifications ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
    }]))
  } catch (error) {
    console.error('[telegram-config] Failed to read Supabase', error)
    throw error
  }
}

export async function updateTelegramConfig(
  memberId: string,
  update: Omit<Partial<TelegramConfig>, 'createdAt'>
): Promise<TelegramConfig> {
  const values = hasSupabase() ? await loadTelegramConfigs() : readLocal()
  const existing = values[memberId]
  const now = new Date().toISOString()
  const saved: TelegramConfig = {
    chatId: update.chatId ?? existing?.chatId ?? '',
    ...(update.botToken !== undefined
      ? update.botToken ? { botToken: update.botToken } : {}
      : existing?.botToken ? { botToken: existing.botToken } : {}),
    enabled: update.enabled ?? existing?.enabled ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    notifications: {
      ...DEFAULT_TELEGRAM_NOTIFICATIONS,
      ...existing?.notifications,
      ...update.notifications,
    },
  }

  if (hasSupabase()) {
    await sbUpsert('telegram_configs', {
      member_id: memberId,
      chat_id: saved.chatId,
      bot_token: saved.botToken ?? null,
      enabled: saved.enabled,
      notifications: saved.notifications ?? {},
      created_at: saved.createdAt,
      updated_at: saved.updatedAt,
    })
  } else {
    values[memberId] = saved
    writeLocal(values)
  }
  return saved
}

export function notificationEnabled(config: TelegramConfig, type: TelegramNotificationType): boolean {
  return config.notifications?.[type] ?? DEFAULT_TELEGRAM_NOTIFICATIONS[type]
}

export async function sendTelegramMessage(chatId: string, text: string, botToken: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
    const result = await response.json()
    return result.ok === true
  } catch {
    return false
  }
}
