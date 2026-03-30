import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'
const DATA_DIR = path.join(process.cwd(), 'data')

function safeRead<T>(file: string, fallback: T): T {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : fallback }
  catch { return fallback }
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const activity = safeRead<{ logins: any[] }>(path.join(DATA_DIR, 'activity.json'), { logins: [] })
  const logins = activity.logins.slice().reverse().slice(0, 100) // newest first, max 100

  const today = new Date().toISOString().split('T')[0]
  const todayCount = activity.logins.filter((l: any) => l.timestamp?.startsWith(today)).length
  const uniqueUsers = new Set(activity.logins.map((l: any) => l.memberId)).size

  return NextResponse.json({
    recentLogins: logins,
    totalLogins: activity.logins.length,
    uniqueUsers,
    todayCount,
  })
}
