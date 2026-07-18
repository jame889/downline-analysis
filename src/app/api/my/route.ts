import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  getAllMembers, getAvailableMonths, getMember, getMemberHistory,
  getMembersForMonth, getMembersForMonthSubtree, getSubtreeIds, bvToThb
} from '@/lib/db'
import type { Member } from '@/lib/types'

export const dynamic = 'force-dynamic'

function getSponsorSubtreeIds(rootId: string, members: Record<string, Member>): Set<string> {
  const children: Record<string, string[]> = {}
  for (const member of Object.values(members)) {
    if (!member.sponsor_id) continue
    ;(children[member.sponsor_id] ??= []).push(member.id)
  }
  const result = new Set<string>()
  const queue = [rootId]
  while (queue.length) {
    const id = queue.shift()!
    if (result.has(id)) continue
    result.add(id)
    for (const child of children[id] ?? []) queue.push(child)
  }
  return result
}

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

  // Placement may pass through an external Upline that is absent from this
  // sponsor-scoped report. Keep both the real Placement subtree and the user's
  // sponsor organization so disconnected Placement branches remain inspectable.
  const placementIds = getSubtreeIds(session.memberId, allMembers)
  const sponsorOrganizationIds = getSponsorSubtreeIds(session.memberId, allMembers)
  const visibleIds = new Set([...Array.from(placementIds), ...Array.from(sponsorOrganizationIds)])
  const reportedTreeNodes = monthMembers
    .filter((item) => visibleIds.has(item.id))
    .map((item) => ({
      id: item.id,
      name: item.name,
      join_date: item.join_date,
      country: item.country,
      // Preserve the real missing Upline id. The 3D renderer presents that
      // branch separately instead of inventing a Sponsor-based connection.
      upline_id: item.upline_id,
      sponsor_id: item.sponsor_id,
      sponsor_name: item.sponsor_id ? (allMembers[item.sponsor_id]?.name ?? '') : '',
      level: item.report.level,
      highest_position: item.report.highest_position,
      is_active: item.report.is_active ? 1 : 0,
      is_qualified: item.report.is_qualified ? 1 : 0,
      monthly_bv: item.report.monthly_bv,
      total_vol_left: item.report.total_vol_left,
      total_vol_right: item.report.total_vol_right,
    }))
  const connectorTreeNodes = Object.values(allMembers)
    .filter((item) => item.placement_connector && visibleIds.has(item.id))
    .map((item) => ({
      id: item.id,
      name: item.name,
      join_date: item.join_date,
      country: item.country,
      upline_id: item.upline_id,
      sponsor_id: item.sponsor_id,
      sponsor_name: item.sponsor_id ? (allMembers[item.sponsor_id]?.name ?? '') : '',
      level: 0,
      highest_position: 'Connector',
      is_active: 0,
      is_qualified: 0,
      monthly_bv: 0,
      total_vol_left: 0,
      total_vol_right: 0,
      is_connector: true,
    }))
  const treeNodes = [...reportedTreeNodes, ...connectorTreeNodes]
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
  const visibleMembers = monthMembers.filter((item) => visibleIds.has(item.id))
  const orgStats = {
    total: visibleMembers.length,
    active: visibleMembers.filter((m) => m.report.is_active).length,
    qualified: visibleMembers.filter((m) => m.report.is_qualified).length,
    total_bv: visibleMembers.reduce((s, m) => s + m.report.monthly_bv, 0),
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
