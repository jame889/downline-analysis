import { RANKS } from './compensation'
import type { Member, MonthlyReport } from './types'
import { POSITION_RANK } from './types'

export type TeamSide = 'ซ้าย' | 'ขวา' | 'ไม่ทราบ'

export interface KeymanRankGap {
  code: 'ST' | 'BR' | 'SV'
  label: 'Star' | 'Bronze' | 'Silver'
  targetEachSide: number
  activeRequiredEachSide: number
  leftGap: number
  rightGap: number
  activeLeftGap: number
  activeRightGap: number
  starTargetEachSide: number
  starLeftGap: number
  starRightGap: number
  qualified: boolean
  progressPct: number
}

export interface KeymanAnalysis {
  id: string
  name: string
  side: TeamSide
  position: string
  highestPosition: string
  isActive: boolean
  monthlyBv: number
  leftBv: number
  rightBv: number
  newBv: number
  previousNewBv: number | null
  trendPct: number | null
  activeLeft: number
  activeRight: number
  starLeft: number
  starRight: number
  g1Count: number
  teamSize: number
  depth: number
  teamDepth: number
  closestRank: KeymanRankGap | null
  rankGaps: KeymanRankGap[]
  bottlenecks: string[]
  opportunityScore: number
  recommendedAction: string
  concentrationPct: number
  concentrationMemberId: string | null
  concentrationMemberName: string | null
  focusMemberId: string | null
  focusMemberName: string | null
  weakSide: Exclude<TeamSide, 'ไม่ทราบ'>
}

export interface PlacementLegAnalysis {
  side: Exclude<TeamSide, 'ไม่ทราบ'>
  keymanId: string | null
  keymanName: string | null
  accumulatedBv: number
  newBv: number
  previousNewBv: number | null
  trendPct: number | null
  teamSize: number
  activeMembers: number
  activeRatePct: number
  contributionPct: number
  bottlenecks: string[]
}

export interface KeymanStructureAnalysis {
  legs: {
    left: PlacementLegAnalysis
    right: PlacementLegAnalysis
  }
  left: KeymanAnalysis[]
  right: KeymanAnalysis[]
  unknown: KeymanAnalysis[]
  closestToStar: KeymanAnalysis[]
  closestToBronze: KeymanAnalysis[]
  closestToSilver: KeymanAnalysis[]
}

const TARGETS = [
  { code: 'ST' as const, rank: 'STAR', label: 'Star' as const, starTargetEachSide: 0 },
  { code: 'BR' as const, rank: 'BRONZE', label: 'Bronze' as const, starTargetEachSide: 1 },
  { code: 'SV' as const, rank: 'SILVER', label: 'Silver' as const, starTargetEachSide: 2 },
].map((target) => {
  const rank = RANKS.find((item) => item.rank === target.rank)!
  return { ...target, targetEachSide: rank.minorBVRequired, activeRequiredEachSide: rank.activeFARequired }
})

function buildChildren(members: Record<string, Member>): Record<string, string[]> {
  const children: Record<string, string[]> = {}
  for (const member of Object.values(members)) {
    if (!member.upline_id) continue
    ;(children[member.upline_id] ??= []).push(member.id)
  }
  for (const ids of Object.values(children)) ids.sort((a, b) => Number(a) - Number(b))
  return children
}

function walk(start: string | undefined, children: Record<string, string[]>): Map<string, number> {
  const result = new Map<string, number>()
  if (!start) return result
  const queue: Array<[string, number]> = [[start, 0]]
  while (queue.length) {
    const [id, depth] = queue.shift()!
    if (result.has(id)) continue
    result.set(id, depth)
    for (const child of children[id] ?? []) queue.push([child, depth + 1])
  }
  return result
}

function rootSide(rootId: string, memberId: string, children: Record<string, string[]>, members: Record<string, Member>): TeamSide {
  const [leftRoot, rightRoot] = children[rootId] ?? []
  let cursor: string | null = memberId
  const seen = new Set<string>()
  while (cursor && cursor !== rootId && !seen.has(cursor)) {
    seen.add(cursor)
    if (cursor === leftRoot) return 'ซ้าย'
    if (cursor === rightRoot) return 'ขวา'
    cursor = members[cursor]?.upline_id ?? null
  }
  return 'ไม่ทราบ'
}

function rankGap(
  report: MonthlyReport,
  activeLeft: number,
  activeRight: number,
  starLeft: number,
  starRight: number,
  target: typeof TARGETS[number],
): KeymanRankGap {
  const leftGap = Math.max(0, target.targetEachSide - report.total_vol_left)
  const rightGap = Math.max(0, target.targetEachSide - report.total_vol_right)
  const activeLeftGap = Math.max(0, target.activeRequiredEachSide - activeLeft)
  const activeRightGap = Math.max(0, target.activeRequiredEachSide - activeRight)
  const starLeftGap = Math.max(0, target.starTargetEachSide - starLeft)
  const starRightGap = Math.max(0, target.starTargetEachSide - starRight)
  const bvProgress = target.targetEachSide > 0
    ? Math.min(report.total_vol_left, report.total_vol_right) / target.targetEachSide
    : 1
  const activeProgress = target.activeRequiredEachSide > 0
    ? Math.min(activeLeft, activeRight) / target.activeRequiredEachSide
    : 1
  return {
    code: target.code,
    label: target.label,
    targetEachSide: target.targetEachSide,
    activeRequiredEachSide: target.activeRequiredEachSide,
    leftGap,
    rightGap,
    activeLeftGap,
    activeRightGap,
    starTargetEachSide: target.starTargetEachSide,
    starLeftGap,
    starRightGap,
    qualified: leftGap === 0 && rightGap === 0 && activeLeftGap === 0 && activeRightGap === 0,
    progressPct: Math.round(Math.min(1, bvProgress, activeProgress) * 100),
  }
}

function memberMomentum(report: MonthlyReport): number {
  return report.monthly_bv + report.current_month_vol_left + report.current_month_vol_right
}

function countAtLeastStar(ids: Iterable<string>, reportMap: Map<string, MonthlyReport>): number {
  let count = 0
  for (const id of Array.from(ids)) {
    const report = reportMap.get(id)
    const rank = POSITION_RANK[report?.income_position ?? 'FA'] ?? POSITION_RANK[report?.highest_position ?? 'FA'] ?? 0
    if (rank >= POSITION_RANK.ST) count++
  }
  return count
}

function pickFocusMember(
  ids: Iterable<string>,
  members: Record<string, Member>,
  reportMap: Map<string, MonthlyReport>,
): { id: string; name: string } | null {
  const candidates = Array.from(ids)
    .map((id) => ({ id, member: members[id], report: reportMap.get(id) }))
    .filter((item) => item.member && item.report && (POSITION_RANK[item.report.income_position] ?? 0) < POSITION_RANK.ST)
    .sort((a, b) => {
      const activeDiff = Number(b.report!.is_active) - Number(a.report!.is_active)
      return activeDiff || memberMomentum(b.report!) - memberMomentum(a.report!)
    })
  const selected = candidates[0]
  return selected ? { id: selected.id, name: selected.member!.name } : null
}

function concentration(
  ids: Iterable<string>,
  members: Record<string, Member>,
  reportMap: Map<string, MonthlyReport>,
): { pct: number; id: string | null; name: string | null } {
  const contributors = Array.from(ids)
    .map((id) => ({ id, member: members[id], bv: reportMap.get(id)?.monthly_bv ?? 0 }))
    .filter((item) => item.member && item.bv > 0)
    .sort((a, b) => b.bv - a.bv)
  const total = contributors.reduce((sum, item) => sum + item.bv, 0)
  const top = contributors[0]
  return {
    pct: total > 0 && top ? Math.round((top.bv / total) * 100) : 0,
    id: top?.id ?? null,
    name: top?.member?.name ?? null,
  }
}

function bottlenecks(gap: KeymanRankGap | null, report: MonthlyReport, activeLeft: number, activeRight: number): string[] {
  if (!gap) return ['ผ่านระดับ Silver แล้ว ให้ประเมินเป้าหมาย Gold ต่อ']
  const result: string[] = []
  if (gap.leftGap > 0 || gap.rightGap > 0) {
    const weak = report.total_vol_left <= report.total_vol_right ? 'ซ้าย' : 'ขวา'
    result.push(`คะแนนฝั่ง${weak}เป็นคอขวด`)
  }
  if (gap.activeLeftGap > 0 || gap.activeRightGap > 0) {
    const weak = activeLeft <= activeRight ? 'ซ้าย' : 'ขวา'
    result.push(`Active FA ฝั่ง${weak}ยังไม่พอ`)
  }
  const high = Math.max(report.total_vol_left, report.total_vol_right)
  const low = Math.min(report.total_vol_left, report.total_vol_right)
  if (high > 0 && low / high < 0.5) result.push('โครงสร้างเสียสมดุลมากกว่า 2 เท่า')
  if (!report.is_active) result.push('Keyman ยัง Inactive ในเดือนล่าสุด')
  return result.length ? result : [`พร้อมผ่าน ${gap.label} เมื่อระบบยืนยันรอบตำแหน่ง`]
}

function percentChange(current: number, previous: number | null): number | null {
  if (previous === null) return null
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

function recommendedAction(gap: KeymanRankGap | null, report: MonthlyReport, activeLeft: number, activeRight: number): string {
  if (!report.is_active) return 'นัดปลุก Keyman และทำแผน Active ภายใน 48 ชั่วโมง'
  if (!gap) return 'รักษา Silver และวางเป้าหมาย Gold ด้วยการสร้างผู้นำสองฝั่ง'
  const leftTotalGap = gap.leftGap + gap.activeLeftGap * 500
  const rightTotalGap = gap.rightGap + gap.activeRightGap * 500
  const side = leftTotalGap >= rightTotalGap ? 'ซ้าย' : 'ขวา'
  const activeGap = side === 'ซ้าย' ? gap.activeLeftGap : gap.activeRightGap
  const bvGap = side === 'ซ้าย' ? gap.leftGap : gap.rightGap
  return `เร่งฝั่ง${side}: เติม ${bvGap.toLocaleString()} BV${activeGap > 0 ? ` และ Active FA ${activeGap} คน` : ''} เพื่อเข้าใกล้ ${gap.label}`
}

function buildLegAnalysis(
  side: Exclude<TeamSide, 'ไม่ทราบ'>,
  legRootId: string | undefined,
  children: Record<string, string[]>,
  members: Record<string, Member>,
  reportMap: Map<string, MonthlyReport>,
  previousMap: Map<string, MonthlyReport>,
  rootReport: MonthlyReport | undefined,
): PlacementLegAnalysis {
  const tree = walk(legRootId, children)
  const activeMembers = Array.from(tree.keys()).filter((id) => reportMap.get(id)?.is_active).length
  const accumulatedBv = side === 'ซ้าย' ? rootReport?.total_vol_left ?? 0 : rootReport?.total_vol_right ?? 0
  const newBv = side === 'ซ้าย' ? rootReport?.current_month_vol_left ?? 0 : rootReport?.current_month_vol_right ?? 0
  const previousRoot = rootReport ? previousMap.get(rootReport.member_id) : undefined
  const previousNewBv = previousRoot
    ? side === 'ซ้าย' ? previousRoot.current_month_vol_left : previousRoot.current_month_vol_right
    : null
  const totalNew = (rootReport?.current_month_vol_left ?? 0) + (rootReport?.current_month_vol_right ?? 0)
  const legRootReport = legRootId ? reportMap.get(legRootId) : undefined
  const issues: string[] = []
  const trendPct = percentChange(newBv, previousNewBv)
  if (!legRootId) issues.push(`ยังไม่มี Placement Keyman ฝั่ง${side}`)
  if (legRootReport && !legRootReport.is_active) issues.push(`Keyman ชั้นแรกฝั่ง${side}ยัง Inactive`)
  if (tree.size > 0 && activeMembers / tree.size < 0.35) issues.push(`Active Rate ฝั่ง${side}ต่ำกว่า 35%`)
  if (trendPct !== null && trendPct < 0) issues.push(`New BV ฝั่ง${side}ลดลง ${Math.abs(trendPct)}%`)
  if (!issues.length) issues.push(`ฝั่ง${side}ยังเดินหน้า ให้ติดตาม Keyman ทุก 48 ชั่วโมง`)

  return {
    side,
    keymanId: legRootId ?? null,
    keymanName: legRootId ? members[legRootId]?.name ?? legRootId : null,
    accumulatedBv,
    newBv,
    previousNewBv,
    trendPct,
    teamSize: tree.size,
    activeMembers,
    activeRatePct: tree.size ? Math.round((activeMembers / tree.size) * 100) : 0,
    contributionPct: totalNew > 0 ? Math.round((newBv / totalNew) * 100) : 0,
    bottlenecks: issues,
  }
}

export function analyzeKeymanStructure(
  rootId: string,
  members: Record<string, Member>,
  reports: MonthlyReport[],
  previousReports: MonthlyReport[] = [],
): KeymanStructureAnalysis {
  const children = buildChildren(members)
  const reportMap = new Map(reports.map((report) => [report.member_id, report]))
  const previousMap = new Map(previousReports.map((report) => [report.member_id, report]))
  const rootTree = walk(rootId, children)
  const keymen: KeymanAnalysis[] = []

  for (const [id, rootDepth] of Array.from(rootTree.entries())) {
    if (id === rootId) continue
    const member = members[id]
    const report = reportMap.get(id)
    if (!member || !report) continue

    const [leftRoot, rightRoot] = children[id] ?? []
    const g1Count = children[id]?.length ?? 0
    const leftTree = walk(leftRoot, children)
    const rightTree = walk(rightRoot, children)
    const activeLeft = Array.from(leftTree.keys()).filter((memberId) => reportMap.get(memberId)?.is_active).length
    const activeRight = Array.from(rightTree.keys()).filter((memberId) => reportMap.get(memberId)?.is_active).length
    const starLeft = countAtLeastStar(leftTree.keys(), reportMap)
    const starRight = countAtLeastStar(rightTree.keys(), reportMap)
    const rankGaps = TARGETS.map((target) => rankGap(report, activeLeft, activeRight, starLeft, starRight, target))
    const currentRank = POSITION_RANK[report.income_position] ?? POSITION_RANK[report.highest_position] ?? 0
    const closestRank = rankGaps.find((gap) => currentRank < (POSITION_RANK[gap.code] ?? 0) && !gap.qualified) ?? null
    const side = rootSide(rootId, id, children, members)
    const teamSize = leftTree.size + rightTree.size
    const depth = Math.max(0, ...Array.from(leftTree.values(), (value) => value + 1), ...Array.from(rightTree.values(), (value) => value + 1))
    const opportunityScore = closestRank
      ? Math.round(closestRank.progressPct * 0.7 + Math.min(20, report.current_month_vol_left + report.current_month_vol_right > 0 ? 20 : 0) + (side !== 'ไม่ทราบ' ? 10 : 0))
      : 100
    const newBv = report.current_month_vol_left + report.current_month_vol_right
    const previousReport = previousMap.get(id)
    const previousNewBv = previousReport
      ? previousReport.current_month_vol_left + previousReport.current_month_vol_right
      : null
    const weakSide: Exclude<TeamSide, 'ไม่ทราบ'> = closestRank
      ? closestRank.leftGap + closestRank.activeLeftGap * 500 >= closestRank.rightGap + closestRank.activeRightGap * 500 ? 'ซ้าย' : 'ขวา'
      : report.total_vol_left <= report.total_vol_right ? 'ซ้าย' : 'ขวา'
    const weakTree = weakSide === 'ซ้าย' ? leftTree : rightTree
    const focusMember = pickFocusMember(weakTree.keys(), members, reportMap)
    const concentrated = concentration(
      [...Array.from(leftTree.keys()), ...Array.from(rightTree.keys())],
      members,
      reportMap,
    )

    keymen.push({
      id,
      name: member.name,
      side,
      position: report.income_position || report.highest_position || 'FA',
      highestPosition: report.highest_position || 'FA',
      isActive: report.is_active,
      monthlyBv: report.monthly_bv,
      leftBv: report.total_vol_left,
      rightBv: report.total_vol_right,
      newBv,
      previousNewBv,
      trendPct: percentChange(newBv, previousNewBv),
      activeLeft,
      activeRight,
      starLeft,
      starRight,
      g1Count,
      teamSize,
      depth: rootDepth + depth,
      teamDepth: depth,
      closestRank,
      rankGaps,
      bottlenecks: bottlenecks(closestRank, report, activeLeft, activeRight),
      opportunityScore,
      recommendedAction: recommendedAction(closestRank, report, activeLeft, activeRight),
      concentrationPct: concentrated.pct,
      concentrationMemberId: concentrated.id,
      concentrationMemberName: concentrated.name,
      focusMemberId: focusMember?.id ?? null,
      focusMemberName: focusMember?.name ?? null,
      weakSide,
    })
  }

  // Keyman requires accumulated placement volume on at least one leg. People
  // with 0/0 volume are regular team members, even when active or ranked.
  const ranked = keymen
    .filter((item) => item.leftBv > 0 || item.rightBv > 0)
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.newBv - a.newBv)
  const near = (code: KeymanRankGap['code']) => ranked
    .filter((item) => item.closestRank?.code === code)
    .sort((a, b) => (b.closestRank?.progressPct ?? 0) - (a.closestRank?.progressPct ?? 0))
    .slice(0, 20)

  const [leftRoot, rightRoot] = children[rootId] ?? []
  const rootReport = reportMap.get(rootId)

  return {
    legs: {
      left: buildLegAnalysis('ซ้าย', leftRoot, children, members, reportMap, previousMap, rootReport),
      right: buildLegAnalysis('ขวา', rightRoot, children, members, reportMap, previousMap, rootReport),
    },
    left: ranked.filter((item) => item.side === 'ซ้าย'),
    right: ranked.filter((item) => item.side === 'ขวา'),
    unknown: ranked.filter((item) => item.side === 'ไม่ทราบ'),
    closestToStar: near('ST'),
    closestToBronze: near('BR'),
    closestToSilver: near('SV'),
  }
}
