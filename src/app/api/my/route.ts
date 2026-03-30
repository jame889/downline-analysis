import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  getAvailableMonths, getMember, getMemberHistory,
  getMembersForMonthSubtree, getTreeData, bvToThb
} from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const months = getAvailableMonths()
  const month = searchParams.get('month') ?? months[0]

  const member = getMember(session.memberId)
  const history = getMemberHistory(session.memberId)

  // Direct downlines for current month
  const subtreeMembers = getMembersForMonthSubtree(month, session.memberId)
  const myReport = subtreeMembers.find((m) => m.id === session.memberId)?.report ?? null

  // Direct downlines = members in subtree at level immediately below me
  const directDownlines = subtreeMembers
    .filter((m) => m.upline_id === session.memberId)
    .map((m) => ({
      id: m.id,
      name: m.name,
      join_date: m.join_date,
      position: m.report.highest_position,
      is_active: m.report.is_active,
      is_qualified: m.report.is_qualified,
      monthly_bv: m.report.monthly_bv,
      monthly_thb: bvToThb(m.report.monthly_bv),
      total_vol_left: m.report.total_vol_left,
      total_vol_right: m.report.total_vol_right,
      level: m.report.level,
    }))

  // Tree data for subtree
  const treeNodes = getTreeData(month, session.memberId)

  // Enrich history with THB
  const historyWithThb = history.map((r) => ({
    ...r,
    monthly_thb: bvToThb(r.monthly_bv),
    vol_left_thb: bvToThb(r.total_vol_left),
    vol_right_thb: bvToThb(r.total_vol_right),
    weak_leg_bv: Math.min(r.total_vol_left, r.total_vol_right),
    weak_leg_thb: bvToThb(Math.min(r.total_vol_left, r.total_vol_right)),
  }))

  // Subtree stats
  const orgStats = {
    total: subtreeMembers.length,
    active: subtreeMembers.filter((m) => m.report.is_active).length,
    qualified: subtreeMembers.filter((m) => m.report.is_qualified).length,
    total_bv: subtreeMembers.reduce((s, m) => s + m.report.monthly_bv, 0),
  }

  return NextResponse.json({
    member,
    myReport: myReport
      ? {
          ...myReport,
          monthly_thb: bvToThb(myReport.monthly_bv),
          vol_left_thb: bvToThb(myReport.total_vol_left),
          vol_right_thb: bvToThb(myReport.total_vol_right),
          weak_leg_bv: Math.min(myReport.total_vol_left, myReport.total_vol_right),
          weak_leg_thb: bvToThb(Math.min(myReport.total_vol_left, myReport.total_vol_right)),
        }
      : null,
    history: historyWithThb,
    directDownlines,
    treeNodes,
    orgStats,
    month,
    months,
  })
}
