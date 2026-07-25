import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { loadLoginActivities } from '@/lib/login-activity'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const logins = await loadLoginActivities()

  const today = new Date().toISOString().split('T')[0]
  const todayCount = logins.filter((login) => login.timestamp.startsWith(today)).length
  const uniqueUsers = new Set(logins.map((login) => login.memberId)).size

  return NextResponse.json({
    recentLogins: logins.slice(0, 100),
    totalLogins: logins.length,
    uniqueUsers,
    todayCount,
  })
}
