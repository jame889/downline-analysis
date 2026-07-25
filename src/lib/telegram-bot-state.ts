import fs from 'fs'
import path from 'path'
import { hasSupabase, sbInsert, sbSelect, sbUpsert } from './supabase'

const LOCAL_PATH = path.join(process.cwd(), 'data', 'telegram-bot-state.json')

export interface TelegramConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

interface TelegramBotState {
  processedUpdateIds: string[]
  conversations: Record<string, TelegramConversationMessage[]>
  lastActivityIds: Record<string, string>
}

interface TelegramBotStateRow {
  member_id: string
  conversation: TelegramConversationMessage[]
  last_activity_id?: string | null
  updated_at: string
}

const EMPTY_STATE: TelegramBotState = {
  processedUpdateIds: [],
  conversations: {},
  lastActivityIds: {},
}

function normalize(value: Partial<TelegramBotState> | null | undefined): TelegramBotState {
  return {
    processedUpdateIds: Array.isArray(value?.processedUpdateIds) ? value.processedUpdateIds : [],
    conversations: value?.conversations && typeof value.conversations === 'object' ? value.conversations : {},
    lastActivityIds: value?.lastActivityIds && typeof value.lastActivityIds === 'object' ? value.lastActivityIds : {},
  }
}

function readLocal(): TelegramBotState {
  try {
    if (!fs.existsSync(LOCAL_PATH)) return structuredClone(EMPTY_STATE)
    return normalize(JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf-8')))
  } catch {
    return structuredClone(EMPTY_STATE)
  }
}

async function mutateState<T>(mutator: (state: TelegramBotState) => T): Promise<T> {
  if (!hasSupabase()) {
    const state = readLocal()
    const result = mutator(state)
    fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true })
    fs.writeFileSync(LOCAL_PATH, JSON.stringify(state, null, 2), 'utf-8')
    return result
  }

  throw new Error('Global Telegram state mutation is only available in local development')
}

async function readMemberState(memberId: string): Promise<TelegramBotStateRow | null> {
  const rows = await sbSelect<TelegramBotStateRow>(
    'telegram_bot_states',
    `member_id=eq.${encodeURIComponent(memberId)}&select=*`
  )
  return rows[0] ?? null
}

async function saveMemberState(row: TelegramBotStateRow): Promise<void> {
  await sbUpsert('telegram_bot_states', row)
}

export async function claimTelegramUpdate(updateId: string): Promise<boolean> {
  if (hasSupabase()) {
    const existing = await sbSelect<{ update_id: string }>(
      'telegram_processed_updates',
      `update_id=eq.${encodeURIComponent(updateId)}&select=update_id`
    )
    if (existing.length) return false
    try {
      await sbInsert('telegram_processed_updates', { update_id: updateId })
      return true
    } catch (error) {
      if (String(error).includes('duplicate key')) return false
      throw error
    }
  }
  return mutateState((state) => {
    if (state.processedUpdateIds.includes(updateId)) return false
    state.processedUpdateIds.push(updateId)
    state.processedUpdateIds = state.processedUpdateIds.slice(-300)
    return true
  })
}

export async function getTelegramConversation(memberId: string): Promise<TelegramConversationMessage[]> {
  if (hasSupabase()) return ((await readMemberState(memberId))?.conversation ?? []).slice(-6)
  return (readLocal().conversations[memberId] ?? []).slice(-6)
}

export async function appendTelegramConversation(
  memberId: string,
  messages: TelegramConversationMessage[]
): Promise<void> {
  if (hasSupabase()) {
    const existing = await readMemberState(memberId)
    await saveMemberState({
      member_id: memberId,
      conversation: [...(existing?.conversation ?? []), ...messages]
        .filter((message) => message.content.trim())
        .slice(-8),
      last_activity_id: existing?.last_activity_id ?? null,
      updated_at: new Date().toISOString(),
    })
    return
  }
  await mutateState((state) => {
    state.conversations[memberId] = [...(state.conversations[memberId] ?? []), ...messages]
      .filter((message) => message.content.trim())
      .slice(-8)
  })
}

export async function setLastTelegramActivity(memberId: string, activityId: string | null): Promise<void> {
  if (hasSupabase()) {
    const existing = await readMemberState(memberId)
    await saveMemberState({
      member_id: memberId,
      conversation: existing?.conversation ?? [],
      last_activity_id: activityId,
      updated_at: new Date().toISOString(),
    })
    return
  }
  await mutateState((state) => {
    if (activityId) state.lastActivityIds[memberId] = activityId
    else delete state.lastActivityIds[memberId]
  })
}

export async function getLastTelegramActivity(memberId: string): Promise<string | null> {
  if (hasSupabase()) return (await readMemberState(memberId))?.last_activity_id ?? null
  return readLocal().lastActivityIds[memberId] ?? null
}
