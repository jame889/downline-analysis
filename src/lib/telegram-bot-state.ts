import fs from 'fs'
import path from 'path'
import { BlobPreconditionFailedError, get, put } from '@vercel/blob'

const BLOB_PATH = 'member-metadata/telegram-bot-state.json'
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

type BlobState = { value: TelegramBotState; etag?: string }

const EMPTY_STATE: TelegramBotState = {
  processedUpdateIds: [],
  conversations: {},
  lastActivityIds: {},
}

function hasBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
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

async function readBlob(): Promise<BlobState> {
  const result = await get(BLOB_PATH, { access: 'private', useCache: false })
  if (!result || result.statusCode !== 200) return { value: structuredClone(EMPTY_STATE) }
  return {
    value: normalize(JSON.parse(await new Response(result.stream).text())),
    etag: result.blob.etag,
  }
}

async function mutateState<T>(mutator: (state: TelegramBotState) => T): Promise<T> {
  if (!hasBlobStorage()) {
    const state = readLocal()
    const result = mutator(state)
    fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true })
    fs.writeFileSync(LOCAL_PATH, JSON.stringify(state, null, 2), 'utf-8')
    return result
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { value, etag } = await readBlob()
    const result = mutator(value)
    try {
      await put(BLOB_PATH, JSON.stringify(value), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: Boolean(etag),
        cacheControlMaxAge: 60,
        contentType: 'application/json',
        ...(etag ? { ifMatch: etag } : {}),
      })
      return result
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError) || attempt === 2) throw error
    }
  }
  throw new Error('Unable to update Telegram bot state')
}

export async function claimTelegramUpdate(updateId: string): Promise<boolean> {
  return mutateState((state) => {
    if (state.processedUpdateIds.includes(updateId)) return false
    state.processedUpdateIds.push(updateId)
    state.processedUpdateIds = state.processedUpdateIds.slice(-300)
    return true
  })
}

export async function getTelegramConversation(memberId: string): Promise<TelegramConversationMessage[]> {
  const state = hasBlobStorage() ? (await readBlob()).value : readLocal()
  return (state.conversations[memberId] ?? []).slice(-6)
}

export async function appendTelegramConversation(
  memberId: string,
  messages: TelegramConversationMessage[]
): Promise<void> {
  await mutateState((state) => {
    state.conversations[memberId] = [...(state.conversations[memberId] ?? []), ...messages]
      .filter((message) => message.content.trim())
      .slice(-8)
  })
}

export async function setLastTelegramActivity(memberId: string, activityId: string | null): Promise<void> {
  await mutateState((state) => {
    if (activityId) state.lastActivityIds[memberId] = activityId
    else delete state.lastActivityIds[memberId]
  })
}

export async function getLastTelegramActivity(memberId: string): Promise<string | null> {
  const state = hasBlobStorage() ? (await readBlob()).value : readLocal()
  return state.lastActivityIds[memberId] ?? null
}
