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
  qualified: boolean
  progressPct: number
}

export interface KeymanAnalysis {
  id: string
  name: string
  side: TeamSide
  position: string
  isActive: boolean
  monthlyBv: number
  leftBv: number
  rightBv: number
  newBv: number
  activeLeft: number
  activeRight: number
  teamSize: number
  depth: number
  closestRank: KeymanRankGap | null
  rankGaps: KeymanRankGap[]
  bottlenecks: string[]
  opportunityScore: number
}

export interface KeymanStructureAnalysis {
  left: KeymanAnalysis[]
  right: KeymanAnalysis[]
  unknown: KeymanAnalysis[]
  closestToStar: KeymanAnalysis[]
  closestToBronze: KeymanAnalysis[]
  closestToSilver: KeymanAnalysis[]
}

const TARGETS = [
  { code: 'ST' as const, rank: 'STAR', label: 'Star' as const },
  { code: 'BR' as const, rank: 'BRONZE', label: 'Bronze' as const },
  { code: 'SV' as const, rank: 'SILVER', label: 'Silver' as const },
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

function rankGap(report: MonthlyReport, activeLeft: number, activeRight: number, target: typeof TARGETS[number]): KeymanRankGap {
  const leftGap = Math.max(0, target.targetEachSide - report.total_vol_left)
  const rightGap = Math.max(0, target.targetEachSide - report.total_vol_right)
  const activeLeftGap = Math.max(0, target.activeRequiredEachSide - activeLeft)
  const activeRightGap = Math.max(0, target.activeRequiredEachSide - activeRight)
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
    qualified: leftGap === 0 && rightGap === 0 && activeLeftGap === 0 && activeRightGap === 0,
    progressPct: Math.round(Math.min(1, bvProgress, activeProgress) * 100),
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

export function analyzeKeymanStructure(
  rootId: string,
  members: Record<string, Member>,
  reports: MonthlyReport[],
): KeymanStructureAnalysis {
  const children = buildChildren(members)
  const reportMap = new Map(reports.map((report) => [report.member_id, report]))
  const rootTree = walk(rootId, children)
  const keymen: KeymanAnalysis[] = []

  for (const [id, rootDepth] of Array.from(rootTree.entries())) {
    if (id === rootId) continue
    const member = members[id]
    const report = reportMap.get(id)
    if (!member || !report) continue

    const [leftRoot, rightRoot] = children[id] ?? []
    const leftTree = walk(leftRoot, children)
    const rightTree = walk(rightRoot, children)
    const activeLeft = Array.from(leftTree.keys()).filter((memberId) => reportMap.get(memberId)?.is_active).length
    const activeRight = Array.from(rightTree.keys()).filter((memberId) => reportMap.get(memberId)?.is_active).length
    const rankGaps = TARGETS.map((target) => rankGap(report, activeLeft, activeRight, target))
    const currentRank = POSITION_RANK[report.income_position] ?? POSITION_RANK[report.highest_position] ?? 0
    const closestRank = rankGaps.find((gap) => currentRank < (POSITION_RANK[gap.code] ?? 0) && !gap.qualified) ?? null
    const side = rootSide(rootId, id, children, members)
    const teamSize = leftTree.size + rightTree.size
    const depth = Math.max(0, ...Array.from(leftTree.values(), (value) => value + 1), ...Array.from(rightTree.values(), (value) => value + 1))
    const opportunityScore = closestRank
      ? Math.round(closestRank.progressPct * 0.7 + Math.min(20, report.current_month_vol_left + report.current_month_vol_right > 0 ? 20 : 0) + (side !== 'ไม่ทราบ' ? 10 : 0))
      : 100

    keymen.push({
      id,
      name: member.name,
      side,
      position: report.income_position || report.highest_position || 'FA',
      isActive: report.is_active,
      monthlyBv: report.monthly_bv,
      leftBv: report.total_vol_left,
      rightBv: report.total_vol_right,
      newBv: report.current_month_vol_left + report.current_month_vol_right,
      activeLeft,
      activeRight,
      teamSize,
      depth: rootDepth + depth,
      closestRank,
      rankGaps,
      bottlenecks: bottlenecks(closestRank, report, activeLeft, activeRight),
      opportunityScore,
    })
  }

  const ranked = keymen
    .filter((item) => item.isActive || item.newBv > 0 || item.position !== 'FA')
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.newBv - a.newBv)
  const near = (code: KeymanRankGap['code']) => ranked
    .filter((item) => item.closestRank?.code === code)
    .sort((a, b) => (b.closestRank?.progressPct ?? 0) - (a.closestRank?.progressPct ?? 0))
    .slice(0, 10)

  return {
    left: ranked.filter((item) => item.side === 'ซ้าย').slice(0, 15),
    right: ranked.filter((item) => item.side === 'ขวา').slice(0, 15),
    unknown: ranked.filter((item) => item.side === 'ไม่ทราบ').slice(0, 10),
    closestToStar: near('ST'),
    closestToBronze: near('BR'),
    closestToSilver: near('SV'),
  }
}
