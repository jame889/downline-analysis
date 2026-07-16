import {
  getAllMembers,
  getAvailableMonths,
  getReportsForMonths,
  getSubtreeIds,
} from './db'
import type { Member, MonthlyReport } from './types'
import { POSITION_RANK } from './types'

export interface GrowthPoint {
  month: string
  totalLeft: number
  totalRight: number
  newLeft: number
  newRight: number
  monthlyBv: number
  highestPosition: string
  incomePosition: string
  leftHighestPosition: string
  rightHighestPosition: string
  active: boolean
  qualified: boolean
  sponsored: number
  movingUps: number
}

export interface RankReadiness {
  code: string
  label: string
  targetLeft: number
  targetRight: number
  requiredPlacement: string
  currentLeft: number
  currentRight: number
  leftPct: number
  rightPct: number
  leftGap: number
  rightGap: number
  leftPlacement: boolean
  rightPlacement: boolean
  volumeQualified: boolean
  placementQualified: boolean
  qualified: boolean
}

export interface FocusCandidate {
  id: string
  name: string
  side: 'ซ้าย' | 'ขวา' | 'ไม่ทราบ'
  position: string
  latestLeft: number
  latestRight: number
  latestNewVolume: number
  sponsorLast3: number
  movingUpsLast3: number
  leadersCreated: number
  activeConsistency: number
  momentumRatio: number
  score: number
  status: 'green' | 'yellow' | 'red'
  recommendation: string
}

export interface GrowthDashboardData {
  member: Member
  months: string[]
  points: GrowthPoint[]
  start: GrowthPoint
  latest: GrowthPoint
  peakLeft: GrowthPoint
  peakRight: GrowthPoint
  leftGrowthPct: number
  rightGrowthPct: number
  balanceRatio: number
  weakSide: 'ซ้าย' | 'ขวา'
  sponsorLast3: number
  movingUpsLast3: number
  sponsorAverage: number
  movingUpAverage: number
  activeConsistency: number
  momentumRatio: number
  gold: RankReadiness
  diamond: RankReadiness
  focusCandidates: FocusCandidate[]
  insights: string[]
}

const RANK_TARGETS = {
  GD: { code: 'GD', label: 'Gold', left: 8000, right: 8000, placement: 'FA' },
  DM: { code: 'DM', label: 'Diamond', left: 50000, right: 50000, placement: 'GD' },
} as const

function rankValue(position: string | null | undefined): number {
  return POSITION_RANK[position ?? 'FA'] ?? 0
}

function pct(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(100, Math.round((value / target) * 1000) / 10)
}

function monthOf(date: string | null | undefined): string | null {
  if (!date) return null
  const match = String(date).match(/^(\d{4}-\d{2})/)
  return match?.[1] ?? null
}

function reportMap(reports: MonthlyReport[]): Map<string, MonthlyReport> {
  return new Map(reports.map((report) => [report.member_id, report]))
}

function buildReadiness(report: MonthlyReport, target: typeof RANK_TARGETS[keyof typeof RANK_TARGETS]): RankReadiness {
  const leftPlacement = rankValue(report.left_highest_pos) >= rankValue(target.placement)
  const rightPlacement = rankValue(report.right_highest_pos) >= rankValue(target.placement)
  const volumeQualified = report.total_vol_left >= target.left && report.total_vol_right >= target.right
  const placementQualified = leftPlacement && rightPlacement
  return {
    code: target.code,
    label: target.label,
    targetLeft: target.left,
    targetRight: target.right,
    requiredPlacement: target.placement,
    currentLeft: report.total_vol_left,
    currentRight: report.total_vol_right,
    leftPct: pct(report.total_vol_left, target.left),
    rightPct: pct(report.total_vol_right, target.right),
    leftGap: Math.max(0, target.left - report.total_vol_left),
    rightGap: Math.max(0, target.right - report.total_vol_right),
    leftPlacement,
    rightPlacement,
    volumeQualified,
    placementQualified,
    qualified: volumeQualified && placementQualified,
  }
}

function directChildren(rootId: string, members: Record<string, Member>): string[] {
  return Object.values(members)
    .filter((member) => member.upline_id === rootId)
    .map((member) => member.id)
    .sort((a, b) => Number(a) - Number(b))
}

function sideForMember(rootId: string, memberId: string, members: Record<string, Member>): 'ซ้าย' | 'ขวา' | 'ไม่ทราบ' {
  const children = directChildren(rootId, members)
  const leftRoot = children[0]
  const rightRoot = children[1]
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

function countMovingUps(
  sponsoredIds: string[],
  previous: Map<string, MonthlyReport>,
  current: Map<string, MonthlyReport>,
): number {
  let count = 0
  for (const id of sponsoredIds) {
    const prev = previous.get(id)
    const curr = current.get(id)
    if (!prev || !curr) continue
    if (rankValue(curr.income_position) > rankValue(prev.income_position)) count++
  }
  return count
}

function candidateRecommendation(candidate: Omit<FocusCandidate, 'recommendation'>): string {
  if (candidate.movingUpsLast3 >= 2 && candidate.sponsorLast3 >= 2) {
    return 'โค้ช 1:1 และวางแผนพาขึ้น Gold — มีทั้งพลังเปิดคนและพัฒนาคน'
  }
  if (candidate.sponsorLast3 >= 2 && candidate.movingUpsLast3 === 0) {
    return 'ลดการเปิดเพิ่มชั่วคราว แล้วโฟกัส Start Up และ Moving Up คนเดิม'
  }
  if (candidate.movingUpsLast3 >= 1 && candidate.sponsorLast3 === 0) {
    return 'เป็น Hidden Leader — เติมรายชื่อและกิจกรรมเปิดคนให้มากขึ้น'
  }
  if (candidate.momentumRatio < 0.75) {
    return 'Momentum ลดลง — นัด Review และกำหนดกิจกรรม 7 วันแบบชัดเจน'
  }
  return 'โค้ชเป็นกลุ่ม ติดตามกิจกรรม และประเมินใหม่ใน 14 วัน'
}

export async function getGrowthDashboardData(memberId: string, window = 9): Promise<GrowthDashboardData | null> {
  const [members, availableMonths] = await Promise.all([getAllMembers(), getAvailableMonths()])
  const member = members[memberId]
  if (!member) return null

  const months = availableMonths.slice().sort().slice(-Math.max(3, window))
  const reportsByMonth = await getReportsForMonths(months)
  const maps = Object.fromEntries(months.map((month) => [month, reportMap(reportsByMonth[month] ?? [])]))
  const directSponsored = Object.values(members)
    .filter((candidate) => candidate.sponsor_id === memberId)
    .map((candidate) => candidate.id)

  const points: GrowthPoint[] = []
  for (let index = 0; index < months.length; index++) {
    const month = months[index]
    const report = maps[month].get(memberId)
    if (!report) continue
    const previous = index > 0 ? maps[months[index - 1]] : new Map<string, MonthlyReport>()
    points.push({
      month,
      totalLeft: report.total_vol_left,
      totalRight: report.total_vol_right,
      newLeft: report.current_month_vol_left,
      newRight: report.current_month_vol_right,
      monthlyBv: report.monthly_bv,
      highestPosition: report.highest_position,
      incomePosition: report.income_position,
      leftHighestPosition: report.left_highest_pos,
      rightHighestPosition: report.right_highest_pos,
      active: report.is_active,
      qualified: report.is_qualified,
      sponsored: Object.values(members).filter((candidate) => candidate.sponsor_id === memberId && monthOf(candidate.join_date) === month).length,
      movingUps: countMovingUps(directSponsored, previous, maps[month]),
    })
  }

  if (points.length === 0) return null
  const start = points[0]
  const latest = points[points.length - 1]
  const latestReport = maps[latest.month].get(memberId)!
  const peakLeft = points.reduce((best, point) => point.totalLeft > best.totalLeft ? point : best, points[0])
  const peakRight = points.reduce((best, point) => point.totalRight > best.totalRight ? point : best, points[0])
  const trailing = points.slice(-3)
  const previousMomentum = trailing.slice(0, -1)
  const latestNew = latest.newLeft + latest.newRight
  const priorAverage = previousMomentum.length
    ? previousMomentum.reduce((sum, point) => sum + point.newLeft + point.newRight, 0) / previousMomentum.length
    : latestNew
  const momentumRatio = priorAverage > 0 ? latestNew / priorAverage : latestNew > 0 ? 2 : 0

  const subtree = getSubtreeIds(memberId, members)
  const latestMap = maps[latest.month]
  const last3Months = months.slice(-3)
  const focusCandidates: FocusCandidate[] = []

  for (const candidateId of Array.from(subtree)) {
    if (candidateId === memberId) continue
    const candidateMember = members[candidateId]
    const candidateLatest = latestMap.get(candidateId)
    if (!candidateMember || !candidateLatest || !candidateLatest.is_active) continue

    const candidateSponsored = Object.values(members)
      .filter((person) => person.sponsor_id === candidateId)
      .map((person) => person.id)
    const candidateReports = months
      .map((month) => maps[month].get(candidateId))
      .filter(Boolean) as MonthlyReport[]
    const activeConsistency = candidateReports.length
      ? candidateReports.filter((report) => report.is_active).length / candidateReports.length
      : 0
    const sponsorLast3 = Object.values(members).filter((person) =>
      person.sponsor_id === candidateId && last3Months.includes(monthOf(person.join_date) ?? '')
    ).length

    let movingUpsLast3 = 0
    for (let i = Math.max(1, months.length - 3); i < months.length; i++) {
      movingUpsLast3 += countMovingUps(candidateSponsored, maps[months[i - 1]], maps[months[i]])
    }

    const newVolumes = last3Months.map((month) => {
      const report = maps[month].get(candidateId)
      return report ? report.current_month_vol_left + report.current_month_vol_right : 0
    })
    const candidateLatestNew = newVolumes[newVolumes.length - 1] ?? 0
    const candidatePreviousAverage = newVolumes.length > 1
      ? newVolumes.slice(0, -1).reduce((sum, value) => sum + value, 0) / (newVolumes.length - 1)
      : candidateLatestNew
    const candidateMomentum = candidatePreviousAverage > 0
      ? candidateLatestNew / candidatePreviousAverage
      : candidateLatestNew > 0 ? 2 : 0
    const leadersCreated = candidateSponsored.filter((id) => rankValue(latestMap.get(id)?.income_position) >= rankValue('ST')).length
    const side = sideForMember(memberId, candidateId, members)
    const weakSide = latest.totalLeft <= latest.totalRight ? 'ซ้าย' : 'ขวา'

    const score = Math.round(Math.min(100,
      activeConsistency * 25 +
      Math.min(1, sponsorLast3 / 3) * 20 +
      Math.min(1, movingUpsLast3 / 2) * 25 +
      Math.min(1, candidateMomentum / 1.2) * 15 +
      Math.min(1, leadersCreated / 2) * 10 +
      (side === weakSide ? 5 : 0)
    ))
    const status: FocusCandidate['status'] = score >= 70 ? 'green' : score >= 45 ? 'yellow' : 'red'
    const base = {
      id: candidateId,
      name: candidateMember.name,
      side,
      position: candidateLatest.income_position,
      latestLeft: candidateLatest.total_vol_left,
      latestRight: candidateLatest.total_vol_right,
      latestNewVolume: candidateLatestNew,
      sponsorLast3,
      movingUpsLast3,
      leadersCreated,
      activeConsistency: Math.round(activeConsistency * 100),
      momentumRatio: Math.round(candidateMomentum * 100) / 100,
      score,
      status,
    }
    focusCandidates.push({ ...base, recommendation: candidateRecommendation(base) })
  }

  focusCandidates.sort((a, b) => b.score - a.score || b.latestNewVolume - a.latestNewVolume)

  const sponsorLast3 = trailing.reduce((sum, point) => sum + point.sponsored, 0)
  const movingUpsLast3 = trailing.reduce((sum, point) => sum + point.movingUps, 0)
  const weakSide: 'ซ้าย' | 'ขวา' = latest.totalLeft <= latest.totalRight ? 'ซ้าย' : 'ขวา'
  const balanceRatio = Math.max(latest.totalLeft, latest.totalRight) > 0
    ? Math.min(latest.totalLeft, latest.totalRight) / Math.max(latest.totalLeft, latest.totalRight)
    : 0

  const insights = [
    `ฝั่ง${weakSide}เป็น Weak Leg ปัจจุบัน และควรได้รับทรัพยากรมากกว่าฝั่งแข็งแรง`,
    momentumRatio >= 1
      ? `Momentum เดือนล่าสุดสูงกว่าค่าเฉลี่ยก่อนหน้า ${Math.round((momentumRatio - 1) * 100)}%`
      : `Momentum เดือนล่าสุดลดลง ${Math.round((1 - momentumRatio) * 100)}% จากค่าเฉลี่ยก่อนหน้า`,
    movingUpsLast3 > 0
      ? `มีการ Moving Up ${movingUpsLast3} ครั้งใน 3 เดือนล่าสุด — ควรลงลึกกับคนที่ทำซ้ำได้`
      : 'ยังไม่มี Moving Up ใน 3 เดือนล่าสุด — คอขวดคือการพัฒนาคน ไม่ใช่ยอดเพียงอย่างเดียว',
    `ผู้สมัครโค้ชอันดับแรกคือ ${focusCandidates[0]?.name ?? 'ยังไม่มีข้อมูลเพียงพอ'} (${focusCandidates[0]?.score ?? 0}/100)`,
  ]

  return {
    member,
    months,
    points,
    start,
    latest,
    peakLeft,
    peakRight,
    leftGrowthPct: start.totalLeft > 0 ? ((latest.totalLeft / start.totalLeft) - 1) * 100 : 0,
    rightGrowthPct: start.totalRight > 0 ? ((latest.totalRight / start.totalRight) - 1) * 100 : 0,
    balanceRatio,
    weakSide,
    sponsorLast3,
    movingUpsLast3,
    sponsorAverage: trailing.length ? sponsorLast3 / trailing.length : 0,
    movingUpAverage: trailing.length ? movingUpsLast3 / trailing.length : 0,
    activeConsistency: Math.round((points.filter((point) => point.active).length / points.length) * 100),
    momentumRatio,
    gold: buildReadiness(latestReport, RANK_TARGETS.GD),
    diamond: buildReadiness(latestReport, RANK_TARGETS.DM),
    focusCandidates: focusCandidates.slice(0, 12),
    insights,
  }
}
