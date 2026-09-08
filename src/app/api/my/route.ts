import { loadBusinessReportSnapshot, loadBusinessReportSnapshotSeries } from '@/lib/business-report-sync'
import { withDataRequest } from '@/lib/data-request'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  getAllMembers, getAvailableMonths, getSubtreeIds, bvToThb
} from '@/lib/db'
import { getBundledHistoryReport } from '@/lib/history-db'
import { analyzeKeymanStructure } from '@/lib/keyman-analysis'
import type { Member, MonthlyReport } from '@/lib/types'

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

function getPlacementLegIds(rootId: string, members: Record<string, Member>) {
  const children: Record<string, string[]> = {}
  for (const member of Object.values(members)) {
    if (!member.upline_id) continue
    ;(children[member.upline_id] ??= []).push(member.id)
  }
  for (const ids of Object.values(children)) ids.sort((a, b) => Number(a) - Number(b))

  const collect = (startId: string | undefined) => {
    const result = new Set<string>()
    const queue = startId ? [startId] : []
    while (queue.length) {
      const id = queue.shift()!
      if (result.has(id)) continue
      result.add(id)
      queue.push(...(children[id] ?? []))
    }
    return result
  }

  const [leftRoot, rightRoot] = children[rootId] ?? []
  return { left: collect(leftRoot), right: collect(rightRoot) }
}

export async function GET(req: NextRequest) {
  return withDataRequest(async () => {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const months = await getAvailableMonths()
  const month = searchParams.get('month') ?? months[0]
  if (!months.includes(month)) return NextResponse.json({ error: 'Invalid report month' }, { status: 400 })
  const selectedMonthIndex = months.indexOf(month)
  const previousMonth = selectedMonthIndex >= 0 ? months[selectedMonthIndex + 1] : undefined

  // Current synchronized snapshots are authoritative. Fetch their report
  // series once rather than making one large database request per month.
  const [selectedSnapshot, snapshotSeries] = await Promise.all([
    loadBusinessReportSnapshot(month),
    loadBusinessReportSnapshotSeries(months.filter((item) => item !== month)),
  ])
  const allMembers = selectedSnapshot?.members ?? await getAllMembers()
  const member = allMembers[session.memberId] ?? null
  const historyReportsByMonth = Object.fromEntries(snapshotSeries.map((item) => [item.month, item.reports]))
  if (selectedSnapshot) historyReportsByMonth[selectedSnapshot.month] = selectedSnapshot.reports
  for (const historyMonth of months) {
    if (!historyReportsByMonth[historyMonth]) {
      historyReportsByMonth[historyMonth] = getBundledHistoryReport(historyMonth)
    }
  }
  const history = months.slice().sort().flatMap((historyMonth) => {
    const report = historyReportsByMonth[historyMonth]?.find((row) => row.member_id === session.memberId)
    return report ? [report] : []
  })

  // Organization and report data for the selected month
  const selectedReports = selectedSnapshot?.reports ?? historyReportsByMonth[month] ?? []
  const monthMembers = selectedReports.flatMap((report) => {
    const item = allMembers[report.member_id]
    return item ? [{ ...item, report }] : []
  })
  const subtreeIds = getSubtreeIds(session.memberId, allMembers)
  const subtreeMembers = monthMembers.filter((item) => subtreeIds.has(item.id))
  const myReport = subtreeMembers.find((m) => m.id === session.memberId)?.report ?? null
  const analyzedKeymen = analyzeKeymanStructure(
    session.memberId,
    allMembers,
    monthMembers.map((item) => item.report),
    previousMonth ? historyReportsByMonth[previousMonth] ?? [] : [],
  )
  const includeKeyman = (item: { leftBv: number; rightBv: number }) => Math.max(item.leftBv, item.rightBv) >= 100
  const keymanStructure = {
    left: analyzedKeymen.left.filter(includeKeyman),
    right: analyzedKeymen.right.filter(includeKeyman),
    unknown: analyzedKeymen.unknown.filter(includeKeyman),
  }

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
      // Preserve the real missing Upline id. The 3D renderer presents that
      // branch separately instead of inventing a Sponsor-based connection.
      upline_id: item.upline_id,
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
      upline_id: item.upline_id,
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

  // Enrich history with THB
  const placementLegIds = getPlacementLegIds(session.memberId, allMembers)
  const historyWithThb = history.map((r) => {
    const reports = historyReportsByMonth[r.month] ?? []
    const isKeyman = (report: MonthlyReport) => report.total_vol_left > 0 || report.total_vol_right > 0
    return {
      ...r,
      monthly_thb: bvToThb(r.monthly_bv),
      vol_left_thb: bvToThb(r.total_vol_left),
      vol_right_thb: bvToThb(r.total_vol_right),
      weak_leg_bv: Math.min(r.total_vol_left, r.total_vol_right),
      weak_leg_thb: bvToThb(Math.min(r.total_vol_left, r.total_vol_right)),
      left_keyman_count: reports.filter((report) => placementLegIds.left.has(report.member_id) && isKeyman(report)).length,
      right_keyman_count: reports.filter((report) => placementLegIds.right.has(report.member_id) && isKeyman(report)).length,
    }
  })

  // Subtree stats
  const visibleMembers = monthMembers.filter((item) => visibleIds.has(item.id))
  const orgStats = {
    total: visibleMembers.length,
    active: visibleMembers.filter((m) => m.report.is_active).length,
    qualified: visibleMembers.filter((m) => m.report.is_qualified).length,
    total_bv: visibleMembers.reduce((s, m) => s + m.report.monthly_bv, 0),
  }

  return NextResponse.json({
    source: { month, syncedAt: selectedSnapshot?.syncedAt ?? null },
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
    keymanStructure,
    orgStats,
    month,
    months,
  })
  })
}
