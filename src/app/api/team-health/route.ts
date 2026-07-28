import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getMonthlyTeamHealth } from '@/lib/team-health'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestedMember = request.nextUrl.searchParams.get('member')
  const memberId = session.isAdmin && requestedMember ? requestedMember : session.memberId
  const data = await getMonthlyTeamHealth(memberId, request.nextUrl.searchParams.get('month') ?? undefined)
  if (!data) return NextResponse.json({ error: 'ไม่พบข้อมูล Business Report สำหรับสมาชิกนี้' }, { status: 404 })
  return NextResponse.json(data)
}
