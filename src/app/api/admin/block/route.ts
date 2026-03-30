import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'
const DATA_DIR = path.join(process.cwd(), 'data')
const BLOCKED_FILE = path.join(DATA_DIR, 'blocked.json')

function safeRead<T>(file: string, fallback: T): T {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : fallback }
  catch { return fallback }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { memberId, action, reason } = await req.json()
  if (!memberId || !action) return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  if (memberId === session.memberId) return NextResponse.json({ error: 'Cannot block yourself' }, { status: 400 })

  const blocked = safeRead<Record<string, any>>(BLOCKED_FILE, {})

  if (action === 'block') {
    blocked[memberId] = { blockedAt: new Date().toISOString(), reason: reason ?? 'Blocked by admin', blockedBy: session.memberId }
  } else {
    delete blocked[memberId]
  }

  fs.writeFileSync(BLOCKED_FILE, JSON.stringify(blocked, null, 2))
  return NextResponse.json({ ok: true, action, memberId })
}
