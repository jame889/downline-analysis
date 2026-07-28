import { RANKS, type RankInfo } from './compensation'
import { getAllMembers, getAvailableMonths, getReportsForMonths, getSubtreeIds } from './db'
import type { Member, MonthlyReport } from './types'
import { POSITION_RANK } from './types'

type PlacementSide = 'left' | 'right' | 'unknown'

export interface TeamSideHealth {
  side: 'left' | 'right'
  totalBv: number
  newBv: number
  cv: null
  orderCount: null
  activeMembers: number
  inactiveMembers: number
  newMembers: number
  atRiskMembers: number
  activeRate: number
}

export interface QualifiedLeaderHealth {
  id: string
  name: string
  position: string
  sponsorDepth: number
}

export interface TeamHealthData {
  source: 'Business Report'
  month: string
  availableMonths: string[]
  member: { id: string; name: string; position: string }
  left: TeamSideHealth
  right: TeamSideHealth
  balanceRatio: number
  weakSide: 'left' | 'right'
  nextRank: {
    label: string
    bvTargetEachSide: number
    activeFaTargetEachSide: number
    leftBvGap: number
    rightBvGap: number
    leftActiveGap: number
    rightActiveGap: number
    requiredLeader: string | null
    leftQualifiedLeader: QualifiedLeaderHealth | null
    rightQualifiedLeader: QualifiedLeaderHealth | null
  } | null
  dataAvailability: {
    cv: 'unavailable_in_business_report'
    orderCount: 'unavailable_in_business_report'
  }
}

const POSITION_TO_RANK: Record<string, string> = {
  FA: 'FA', ST: 'STAR', BR: 'BRONZE', SV: 'SILVER', GD: 'GOLD', PL: 'PLATINUM',
  RB: 'RUBY', DM: 'DIAMOND', BD: 'BLUE_DIAMOND', RD: 'RED_DIAMOND',
  CR: 'CROWN', CRA: 'CROWN_ROYAL',
}

function monthOf(value: string | null | undefined): string | null {
  return value?.match(/^(\d{4}-\d{2})/)?.[1] ?? null
}

function positionValue(position: string | null | undefined): number {
  return POSITION_RANK[position ?? 'FA'] ?? 0
}

function directPlacementChildren(rootId: string, members: Record<string, Member>): string[] {
  return Object.values(members)
    .filter((member) => member.upline_id === rootId)
    .map((member) => member.id)
    .sort((a, b) => Number(a) - Number(b))
}

function placementSide(rootId: string, memberId: string, members: Record<string, Member>): PlacementSide {
  const [leftRoot, rightRoot] = directPlacementChildren(rootId, members)
  const seen = new Set<string>()
  let current: string | null = memberId
  while (current && current !== rootId && !seen.has(current)) {
    seen.add(current)
    if (current === leftRoot) return 'left'
    if (current === rightRoot) return 'right'
    current = members[current]?.upline_id ?? null
  }
  return 'unknown'
}

function sponsorDepths(rootId: string, members: Record<string, Member>): Map<string, number> {
  const children: Record<string, string[]> = {}
  for (const member of Object.values(members)) {
    if (member.sponsor_id) (children[member.sponsor_id] ??= []).push(member.id)
  }
  const result = new Map<string, number>()
  const queue = (children[rootId] ?? []).map((id) => ({ id, depth: 1 }))
  while (queue.length) {
    const item = queue.shift()!
    if (result.has(item.id)) continue
    result.set(item.id, item.depth)
    for (const id of children[item.id] ?? []) queue.push({ id, depth: item.depth + 1 })
  }
  return result
}

function findQualifiedLeader(
  rootId: string,
  side: 'left' | 'right',
  requiredRank: string,
  members: Record<string, Member>,
  reports: Map<string, MonthlyReport>,
  sponsorDepth: Map<string, number>,
): QualifiedLeaderHealth | null {
  const candidates: QualifiedLeaderHealth[] = []
  for (const [id, depth] of Array.from(sponsorDepth.entries())) {
    const member = members[id]
    const report = reports.get(id)
    if (!member || !report || placementSide(rootId, id, members) !== side) continue
    const position = report.income_position || report.highest_position
    if (positionValue(position) < positionValue(requiredRank)) continue
    candidates.push({ id, name: member.name, position, sponsorDepth: depth })
  }
  return candidates.sort((a, b) =>
    a.sponsorDepth - b.sponsorDepth || positionValue(b.position) - positionValue(a.position) || Number(a.id) - Number(b.id)
  )[0] ?? null
}

function sideHealth(
  side: 'left' | 'right',
  root: MonthlyReport,
  reports: Map<string, MonthlyReport>,
  previous: Map<string, MonthlyReport>,
  members: Record<string, Member>,
  rootId: string,
  subtree: Set<string>,
  month: string,
): TeamSideHealth {
  let activeMembers = 0
  let inactiveMembers = 0
  let newMembers = 0
  let atRiskMembers = 0
  for (const id of Array.from(subtree)) {
    if (id === rootId || placementSide(rootId, id, members) !== side) continue
    const report = reports.get(id)
    if (!report) continue
    const prev = previous.get(id)
    if (report.is_active) activeMembers++
    else inactiveMembers++
    if (monthOf(members[id]?.join_date) === month) newMembers++
    if (!report.is_active || (prev?.is_active && !report.is_active) || (prev?.is_qualified && !report.is_qualified)) atRiskMembers++
  }
  const totalMembers = activeMembers + inactiveMembers
  return {
    side,
    totalBv: side === 'left' ? root.total_vol_left : root.total_vol_right,
    newBv: side === 'left' ? root.current_month_vol_left : root.current_month_vol_right,
    cv: null,
    orderCount: null,
    activeMembers,
    inactiveMembers,
    newMembers,
    atRiskMembers,
    activeRate: totalMembers ? Math.round((activeMembers / totalMembers) * 100) : 0,
  }
}

function nextRankFor(position: string): RankInfo | null {
  const normalized = POSITION_TO_RANK[position] ?? position
  const currentIndex = RANKS.findIndex((rank) => rank.rank === normalized)
  return currentIndex >= 0 && currentIndex < RANKS.length - 1 ? RANKS[currentIndex + 1] : null
}

export async function getMonthlyTeamHealth(memberId: string, requestedMonth?: string): Promise<TeamHealthData | null> {
  const months = await getAvailableMonths()
  const month = requestedMonth && months.includes(requestedMonth) ? requestedMonth : months[0]
  if (!month) return null
  const previousMonth = months[months.indexOf(month) + 1]
  const [members, reportsByMonth] = await Promise.all([
    getAllMembers(),
    getReportsForMonths([month, previousMonth].filter(Boolean) as string[]),
  ])
  const member = members[memberId]
  const reports = new Map((reportsByMonth[month] ?? []).map((report) => [report.member_id, report]))
  const root = reports.get(memberId)
  if (!member || !root) return null
  const previous = new Map((previousMonth ? reportsByMonth[previousMonth] : []).map((report) => [report.member_id, report]))
  const subtree = getSubtreeIds(memberId, members)
  const left = sideHealth('left', root, reports, previous, members, memberId, subtree, month)
  const right = sideHealth('right', root, reports, previous, members, memberId, subtree, month)
  const nextRank = nextRankFor(root.income_position || root.highest_position)
  const sponsorDepth = sponsorDepths(memberId, members)
  const requiredLeader = nextRank?.placementRank ?? null
  const leftQualifiedLeader = requiredLeader
    ? findQualifiedLeader(memberId, 'left', requiredLeader, members, reports, sponsorDepth)
    : null
  const rightQualifiedLeader = requiredLeader
    ? findQualifiedLeader(memberId, 'right', requiredLeader, members, reports, sponsorDepth)
    : null

  return {
    source: 'Business Report',
    month,
    availableMonths: months,
    member: { id: member.id, name: member.name, position: root.income_position || root.highest_position || 'FA' },
    left,
    right,
    balanceRatio: Math.max(left.totalBv, right.totalBv) > 0 ? Math.round((Math.min(left.totalBv, right.totalBv) / Math.max(left.totalBv, right.totalBv)) * 100) : 0,
    weakSide: left.totalBv <= right.totalBv ? 'left' : 'right',
    nextRank: nextRank ? {
      label: nextRank.rankTH,
      bvTargetEachSide: nextRank.minorBVRequired,
      activeFaTargetEachSide: nextRank.activeFARequired,
      leftBvGap: Math.max(0, nextRank.minorBVRequired - left.totalBv),
      rightBvGap: Math.max(0, nextRank.minorBVRequired - right.totalBv),
      leftActiveGap: Math.max(0, nextRank.activeFARequired - left.activeMembers),
      rightActiveGap: Math.max(0, nextRank.activeFARequired - right.activeMembers),
      requiredLeader,
      leftQualifiedLeader,
      rightQualifiedLeader,
    } : null,
    dataAvailability: {
      cv: 'unavailable_in_business_report',
      orderCount: 'unavailable_in_business_report',
    },
  }
}
