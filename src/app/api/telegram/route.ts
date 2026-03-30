import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const DATA_DIR = path.join(process.cwd(), 'data')
const TELEGRAM_FILE = path.join(DATA_DIR, 'telegram.json')

interface TelegramConfig {
  chatId: string
  botToken?: string
  enabled: boolean
  createdAt: string
}

type TelegramData = Record<string, TelegramConfig>

function loadTelegramConfig(): TelegramData {
  if (!fs.existsSync(TELEGRAM_FILE)) return {}
  return JSON.parse(fs.readFileSync(TELEGRAM_FILE, 'utf-8'))
}

function saveTelegramConfig(data: TelegramData): void {
  fs.writeFileSync(TELEGRAM_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const config = loadTelegramConfig()
    const memberConfig = config[session.memberId] ?? null

    return NextResponse.json({
      configured: !!memberConfig,
      config: memberConfig
        ? { chatId: memberConfig.chatId, enabled: memberConfig.enabled, createdAt: memberConfig.createdAt }
        : null,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to load telegram config' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { chatId, botToken } = body

    if (!chatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 })
    }

    const config = loadTelegramConfig()
    config[session.memberId] = {
      chatId: String(chatId),
      ...(botToken ? { botToken: String(botToken) } : {}),
      enabled: true,
      createdAt: config[session.memberId]?.createdAt ?? new Date().toISOString(),
    }

    saveTelegramConfig(config)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to save telegram config' }, { status: 500 })
  }
}
