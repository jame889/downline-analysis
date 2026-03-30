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

  const search = new URL(req.url).searchParams.get('search')?.toLowerCase() ?? ''

  const members = safeRead<Record<string, any>>(path.join(DATA_DIR, 'members.json'), {})
  const passwords = safeRead<Record<string, string>>(path.join(DATA_DIR, 'passwords.json'), {})
  const passwordMeta = safeRead<Record<string, any>>(path.join(DATA_DIR, 'password_meta.json'), {})
  const blocked = safeRead<Record<string, any>>(path.join(DATA_DIR, 'blocked.json'), {})
  const activity = safeRead<{ logins: any[] }>(path.join(DATA_DIR, 'activity.json'), { logins: [] })

  // Get latest month report
  const months: string[] = safeRead(path.join(DATA_DIR, 'months.json'), [])
  const latestMonth = months.sort().reverse()[0] ?? ''
  const report: any[] = latestMonth ? safeRead(path.join(DATA_DIR, 'reports', `${latestMonth}.json`), []) : []
  const repMap = new Map(report.map((r: any) => [r.member_id, r]))

  // Build login stats per member
  const loginStats: Record<string, { lastLogin: string | null; loginCount: number; lastIp: string | null }> = {}
  for (const entry of activity.logins) {
    if (!loginStats[entry.memberId]) loginStats[entry.memberId] = { lastLogin: null, loginCount: 0, lastIp: null }
    loginStats[entry.memberId].loginCount++
    if (!loginStats[entry.memberId].lastLogin || entry.timestamp > loginStats[entry.memberId].lastLogin!) {
      loginStats[entry.memberId].lastLogin = entry.timestamp
      loginStats[entry.memberId].lastIp = entry.ip ?? null
    }
  }

  const users = Object.values(members)
    .filter((m: any) => !search || m.id.includes(search) || m.name.toLowerCase().includes(search))
    .map((m: any) => {
      const r = repMap.get(m.id)
      const stats = loginStats[m.id] ?? { lastLogin: null, loginCount: 0, lastIp: null }
      const isDefault = passwordMeta[m.id]?.isDefault !== false && passwords[m.id] === m.id
      return {
        id: m.id, name: m.name, join_date: m.join_date, lv: m.lv,
        position: r?.highest_position ?? 'FA',
        is_active: r?.is_active ?? false,
        is_qualified: r?.is_qualified ?? false,
        monthly_bv: r?.monthly_bv ?? 0,
        isBlocked: m.id in blocked,
        blockedAt: blocked[m.id]?.blockedAt ?? null,
        blockedReason: blocked[m.id]?.reason ?? null,
        hasChangedPassword: !isDefault,
        lastLogin: stats.lastLogin,
        loginCount: stats.loginCount,
        lastIp: stats.lastIp,
      }
    })

  return NextResponse.json({ users, total: users.length, month: latestMonth })
}
