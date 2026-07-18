import fs from 'fs'
import path from 'path'
import { BlobPreconditionFailedError, get, put } from '@vercel/blob'

const BLOB_PATH = 'member-metadata/telegram-config.json'
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

export const TELEGRAM_NOTIFICATION_TYPES = ['activity', 'weekly', 'watchlist', 'leaderboard', 'wakeup'] as const
export type TelegramNotificationType = (typeof TELEGRAM_NOTIFICATION_TYPES)[number]

export const DEFAULT_TELEGRAM_NOTIFICATIONS: Record<TelegramNotificationType, boolean> = {
  activity: true,
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
type BlobStore = { values: TelegramConfigStore; etag?: string }

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

function hasBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
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

async function readBlob(): Promise<BlobStore> {
  const result = await get(BLOB_PATH, { access: 'private', useCache: false })
  if (!result || result.statusCode !== 200) return { values: {} }
  const text = await new Response(result.stream).text()
  return { values: JSON.parse(text) as TelegramConfigStore, etag: result.blob.etag }
}

export async function loadTelegramConfigs(): Promise<TelegramConfigStore> {
  if (!hasBlobStorage()) return readLocal()
  try {
    return (await readBlob()).values
  } catch (error) {
    console.error('[telegram-config] Failed to read Blob storage', error)
    return {}
  }
}

async function mutateStore(mutator: (values: TelegramConfigStore) => void): Promise<void> {
  if (!hasBlobStorage()) {
    const values = readLocal()
    mutator(values)
    writeLocal(values)
    return
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { values, etag } = await readBlob()
    mutator(values)
    try {
      await put(BLOB_PATH, JSON.stringify(values), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: Boolean(etag),
        cacheControlMaxAge: 60,
        contentType: 'application/json',
        ...(etag ? { ifMatch: etag } : {}),
      })
      return
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError) || attempt === 2) throw error
    }
  }
}

export async function updateTelegramConfig(
  memberId: string,
  update: Omit<Partial<TelegramConfig>, 'createdAt'>
): Promise<TelegramConfig> {
  let saved!: TelegramConfig
  await mutateStore((values) => {
    const existing = values[memberId]
    const now = new Date().toISOString()
    saved = {
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
    values[memberId] = saved
  })
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
