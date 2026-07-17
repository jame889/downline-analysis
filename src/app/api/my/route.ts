import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  getAllMembers, getAvailableMonths, getMember, getMemberHistory,
  getMembersForMonth, getMembersForMonthSubtree, getTreeData, bvToThb
} from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const months = await getAvailableMonths()
  const month = searchParams.get('month') ?? months[0]

  const [member, allMembers] = await Promise.all([
    getMember(session.memberId),
    getAllMembers(),
  ])
  const history = await getMemberHistory(session.memberId)

  // Organization and report data for the selected month
  const [subtreeMembers, monthMembers] = await Promise.all([
    getMembersForMonthSubtree(month, session.memberId),
    getMembersForMonth(month),
  ])
  const myReport = subtreeMembers.find((m) => m.id === session.memberId)?.report ?? null

  const reportByMemberId = new Map(monthMembers.map((item) => [item.id, item.report]))

  // Personal sponsors are independent from binary Placement/Upline.
  const directSponsored = Object.values(allMembers)
    .filter((item) => item.sponsor_id === session.memberId)
    .flatMap((item) => {
      const report = reportByMemberId.get(item.id)
      if (!report) return []
      return [{
        id: item.id,
        name: item.name,
        join_date: item.join_date,
        position: report.highest_position,
        is_active: report.is_active,
        is_qualified: report.is_qualified,
        monthly_bv: report.monthly_bv,
        monthly_thb: bvToThb(report.monthly_bv),
        total_vol_left: report.total_vol_left,
        total_vol_right: report.total_vol_right,
        level: report.level,
      }]
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))

  // Tree data for subtree
  const treeNodes = await getTreeData(month, session.memberId)
  const visibleSponsorIds = new Set(treeNodes.map((item) => item.id))
  const sponsorDirectory = Object.values(allMembers)
    .filter((item) => item.sponsor_id && visibleSponsorIds.has(item.sponsor_id))
    .map((item) => {
      const report = reportByMemberId.get(item.id)
      return {
        id: item.id,
        name: item.name,
        sponsor_id: item.sponsor_id,
        sponsor_name: item.sponsor_id ? (allMembers[item.sponsor_id]?.name ?? '') : '',
        upline_id: item.upline_id,
        is_active: report?.is_active ? 1 : 0,
        highest_position: report?.highest_position ?? '',
      }
    })

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
    directSponsored,
    treeNodes,
    sponsorDirectory,
    orgStats,
    month,
    months,
  })
}
