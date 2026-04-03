import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAvailableMonths } from '@/lib/db'
import {
  RANKS, planForTarget, calcTeamCommission, calcMatchingBonus,
  calcReferralBonus, getCurrentRankProgress, getRankInfo, TEAM_COMMISSION_RATE,
  calcMatrixBonus, MATRIX_LEVELS, MATRIX_BONUS_PER_ACTIVE,
} from '@/lib/compensation'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const DATA_DIR = path.join(process.cwd(), 'data')

function loadMembers() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'members.json'), 'utf-8')) as Record<string, {
    id: string; name: string; join_date: string; upline_id: string | null; sponsor_id: string | null; lv: number
  }>
}

function loadReport(month: string) {
  const f = path.join(DATA_DIR, 'reports', `${month}.json`)
  if (!fs.existsSync(f)) return []
  return JSON.parse(fs.readFileSync(f, 'utf-8')) as Array<{
    member_id: string; level: number; highest_position: string; monthly_bv: number;
    is_active: boolean; is_qualified: boolean;
    total_vol_left: number; total_vol_right: number;
    current_month_vol_left: number; current_month_vol_right: number;
  }>
}

function buildChildrenMap(members: ReturnType<typeof loadMembers>) {
  const ch: Record<string, string[]> = {}
  for (const m of Object.values(members)) {
    if (m.upline_id) {
      if (!ch[m.upline_id]) ch[m.upline_id] = []
      ch[m.upline_id].push(m.id)
    }
  }
  return ch
}

function getSubtreeMap(start: string, ch: Record<string, string[]>): Map<string, number> {
  const map = new Map<string, number>()
  const q: [string, number][] = [[start, 0]]
  while (q.length) {
    const [id, d] = q.shift()!
    map.set(id, d)
    for (const c of ch[id] ?? []) q.push([c, d + 1])
  }
  return map
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const goalParam = url.searchParams.get('goal')
  const goal = goalParam ? Number(goalParam) : 50_000

  const months = getAvailableMonths()
  const latestMonth = months[0]
  const prevMonth = months[1]

  const members = loadMembers()
  const repMap = new Map(loadReport(latestMonth).map((r) => [r.member_id, r]))
  const prevRepMap = new Map(loadReport(prevMonth ?? '').map((r) => [r.member_id, r]))
  const ch = buildChildrenMap(members)

  const rootId = session.memberId
  const myRep = repMap.get(rootId)
  if (!myRep) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })

  // ── Current state ────────────────────────────────────────────────────────────
  const L = myRep.total_vol_left
  const R = myRep.total_vol_right
  const minorVol = Math.min(L, R)
  const majorVol = Math.max(L, R)
  const currMonthL = myRep.current_month_vol_left
  const currMonthR = myRep.current_month_vol_right
  const currMinorMonthly = Math.min(currMonthL, currMonthR)

  // Count active FA in subtree by side (approx: count active members)
  const subtree = getSubtreeMap(rootId, ch)
  const subtreeIds = Array.from(subtree.keys())
  const activeInSubtree = subtreeIds.filter((id) => id !== rootId && repMap.get(id)?.is_active).length
  // Left side = gen1 children[0] subtree, right side = gen1 children[1]+ subtree
  const gen1 = ch[rootId] ?? []
  let leftActiveFA = 0
  let rightActiveFA = 0
  if (gen1.length >= 1) {
    const leftSub = getSubtreeMap(gen1[0], ch)
    leftActiveFA = Array.from(leftSub.keys()).filter((id) => repMap.get(id)?.is_active).length
  }
  if (gen1.length >= 2) {
    let rightIds: string[] = []
    for (let i = 1; i < gen1.length; i++) {
      rightIds = rightIds.concat(Array.from(getSubtreeMap(gen1[i], ch).keys()))
    }
    rightActiveFA = rightIds.filter((id) => repMap.get(id)?.is_active).length
  }

  const currentPosition = myRep.highest_position
  const rankProgress = getCurrentRankProgress(minorVol, Math.min(leftActiveFA, rightActiveFA))

  // ── Current monthly income estimate ─────────────────────────────────────────
  const currentTeamComm = calcTeamCommission(currMinorMonthly)
  const currentRankInfo = getRankInfo(currentPosition)
  const currentMatching = calcMatchingBonus(currentRankInfo, currentTeamComm * 0.4)
  // New members this month = recruits
  const prevIds = new Set(prevRepMap.keys())
  const newMembersCount = Array.from(repMap.values()).filter((r) => !prevIds.has(r.member_id)).length
  const currentReferral = calcReferralBonus(newMembersCount / 4, 500)
  // Matrix Bonus from active members in subtree
  const currentMatrix = calcMatrixBonus(activeInSubtree, currentPosition)
  const currentMonthlyIncome = Math.round(currentTeamComm + currentMatching + currentReferral + currentMatrix)

  // ── Target plan ──────────────────────────────────────────────────────────────
  const plan = planForTarget(goal)

  // ── Gap analysis ─────────────────────────────────────────────────────────────
  const gapMinorBV = Math.max(0, plan.requiredMinorBVMonthly - currMinorMonthly)
  const gapActiveFA = Math.max(0, plan.requiredActiveFAEachSide - Math.min(leftActiveFA, rightActiveFA))
  const gapIncome = Math.max(0, goal - currentMonthlyIncome)
  const incomeProgressPct = goal > 0 ? Math.min(100, Math.round((currentMonthlyIncome / goal) * 100)) : 100

  // ── Milestones (steps to reach goal) ────────────────────────────────────────
  const milestones: Array<{
    rank: string; rankTH: string; minorBV: number; activeFA: number;
    monthlyIncome: number; oneTimeBonus: number; monthsFromNow: number;
    teamComm: number; matching: number; matrixBonus: number;
  }> = []

  // Find target rank index
  const targetRankIdx = RANKS.findIndex((r) => r.rank === plan.recommendedRank.rank)
  const currentRankIdx = RANKS.findIndex((r) => r.rank === currentPosition)

  // Monthly BV growth rate (from last 2 months data)
  const prevMinorMonthly = Math.min(
    prevRepMap.get(rootId)?.current_month_vol_left ?? 0,
    prevRepMap.get(rootId)?.current_month_vol_right ?? 0
  )
  const monthlyGrowthRate = prevMinorMonthly > 0
    ? (currMinorMonthly - prevMinorMonthly) / prevMinorMonthly
    : 0.2 // assume 20% growth if no data

  let cumulativeMonths = 0
  for (let i = Math.max(1, currentRankIdx + 1); i <= targetRankIdx; i++) {
    const r = RANKS[i]
    const tc = calcTeamCommission(r.minorBVRequired)
    const ri = getRankInfo(r.rank)
    const match = calcMatchingBonus(ri, tc * 0.4)
    const ml = MATRIX_LEVELS.find((m) => m.rank === r.rank)
    const matrixEst = ml ? Math.round(ml.potentialBonus * 0.3) : 0 // assume 30% matrix fill
    // Estimate months to reach this rank
    const monthsNeeded = r.minorBVRequired > currMinorMonthly
      ? Math.ceil(Math.log(r.minorBVRequired / Math.max(currMinorMonthly, 100)) / Math.log(1 + Math.max(monthlyGrowthRate, 0.15)))
      : 1
    cumulativeMonths = Math.max(cumulativeMonths + 1, monthsNeeded)
    milestones.push({
      rank: r.rank,
      rankTH: r.rankTH,
      minorBV: r.minorBVRequired,
      activeFA: r.activeFARequired,
      monthlyIncome: Math.round(tc + match + matrixEst),
      oneTimeBonus: r.oneTimeBonus,
      monthsFromNow: cumulativeMonths,
      teamComm: Math.round(tc),
      matching: Math.round(match),
      matrixBonus: matrixEst,
    })
  }

  // ── Coach JOE action plan ─────────────────────────────────────────────────
  const coachActions: Array<{ priority: 'high' | 'medium' | 'low'; title: string; detail: string; impact: string }> = []

  // Action 1: Fix weak leg (always most important)
  const weakSide = L <= R ? 'ซ้าย' : 'ขวา'
  if (gapMinorBV > 0) {
    const pairsNeeded = Math.ceil(gapMinorBV / 200)
    coachActions.push({
      priority: 'high',
      title: `เพิ่ม Vol สาย${weakSide} ให้ถึง ${plan.requiredMinorBVMonthly.toLocaleString()} BV/เดือน`,
      detail: `ปัจจุบัน Minor Leg = ${currMinorMonthly.toLocaleString()} BV/เดือน ต้องเพิ่มอีก ${gapMinorBV.toLocaleString()} BV (≈${pairsNeeded} คู่/เดือน = ฿${(pairsNeeded * 1000).toLocaleString()})`,
      impact: `+฿${((gapMinorBV) * TEAM_COMMISSION_RATE).toLocaleString()}/เดือน`,
    })
  }

  // Action 2: Recruit for active FA
  if (gapActiveFA > 0) {
    coachActions.push({
      priority: 'high',
      title: `ชวนสมาชิกใหม่ให้ถึง ${plan.requiredActiveFAEachSide} Active FA ต่อสาย`,
      detail: `ต้องการ Active FA แต่ละสาย ${plan.requiredActiveFAEachSide} คน · ปัจจุบันซ้าย ${leftActiveFA} / ขวา ${rightActiveFA} · ขาดอีก ${gapActiveFA} คน`,
      impact: `ปลดล็อก Rank ${plan.recommendedRank.rankTH}`,
    })
  }

  // Action 3: Leadership matching - get Gen1 to be active/qualified
  if (currentRankInfo.matchingGen1Pct > 0) {
    const potentialMatching = Math.round(currentTeamComm * (currentRankInfo.matchingGen1Pct / 100))
    coachActions.push({
      priority: 'medium',
      title: `ปลุก Gen 1 ให้ Active — รับ Leadership Matching ${currentRankInfo.matchingGen1Pct}%`,
      detail: `ถ้า Gen 1 ทำ Vol เท่ากับคุณ คุณจะได้ Matching Bonus ≈ ฿${potentialMatching.toLocaleString()}/เดือน`,
      impact: `+฿${potentialMatching.toLocaleString()}/เดือน`,
    })
  }

  // Action 3b: Matrix Bonus - keep members active
  const matrixGap = Math.max(0, (MATRIX_LEVELS.find((m) => m.rank === currentPosition)?.requiredActive ?? 0) - activeInSubtree)
  if (currentMatrix > 0 || matrixGap > 0) {
    const fullMatrixBonus = MATRIX_LEVELS.find((m) => m.rank === currentPosition)?.potentialBonus ?? 0
    coachActions.push({
      priority: 'medium',
      title: `Matrix Bonus — รักษา Active ในทีมให้ครบ`,
      detail: `Matrix Bonus = ฿${MATRIX_BONUS_PER_ACTIVE}/คน Active ในทีม · ตอนนี้ ${activeInSubtree} คน Active ได้ ฿${currentMatrix.toLocaleString()} · Full Matrix ได้ถึง ฿${fullMatrixBonus.toLocaleString()}/เดือน`,
      impact: `+฿${(fullMatrixBonus - currentMatrix).toLocaleString()} ถ้า Active ครบ`,
    })
  }

  // Action 4: Recruit 1-2 people this week
  const weeklyReferral = calcReferralBonus(2, 500)
  coachActions.push({
    priority: 'medium',
    title: 'สปอนเซอร์ 2 คน/เดือน — รับ Referral Bonus ทันที',
    detail: `ชวนคนซื้อ Pack 25,000 (500 BV) รับ Referral Bonus 500×5 = ฿2,500/คน · ชวน 2 คน = ฿${weeklyReferral.toLocaleString()}`,
    impact: `+฿${weeklyReferral.toLocaleString()}/เดือน`,
  })

  // Action 5: One-time rank bonus
  const nextRankBonus = milestones[0]
  if (nextRankBonus && nextRankBonus.oneTimeBonus > 0) {
    coachActions.push({
      priority: 'low',
      title: `เป้าหมายถัดไป: ${nextRankBonus.rankTH} — รับโบนัสขึ้นตำแหน่ง ฿${nextRankBonus.oneTimeBonus.toLocaleString()}`,
      detail: `ต้องการ Minor Vol ${nextRankBonus.minorBV.toLocaleString()} BV ต่อสาย + Active FA ${nextRankBonus.activeFA} คนต่อสาย · คาด ${nextRankBonus.monthsFromNow} เดือน`,
      impact: `One-time ฿${nextRankBonus.oneTimeBonus.toLocaleString()}`,
    })
  }

  // ── All rank potentials (for calculator UI) ──────────────────────────────────
  const allRankPotentials = RANKS.slice(1).map((r) => {
    const tc = calcTeamCommission(r.minorBVRequired)
    const ri = getRankInfo(r.rank)
    const match = calcMatchingBonus(ri, tc * 0.4)
    const ref = calcReferralBonus((r.activeFARequired * 2) / 12, 500)
    const ml = MATRIX_LEVELS.find((m) => m.rank === r.rank)
    const matrixFull = ml?.potentialBonus ?? 0
    const matrix30 = Math.round(matrixFull * 0.3)
    return {
      rank: r.rank,
      rankTH: r.rankTH,
      minorBVRequired: r.minorBVRequired,
      activeFARequired: r.activeFARequired,
      teamComm: Math.round(tc),
      matching: Math.round(match),
      referral: Math.round(ref),
      matrixBonus: matrix30,
      matrixFull: matrixFull,
      matrixDepth: ml?.matrixDepth ?? 0,
      matrixRequiredActive: ml?.requiredActive ?? 0,
      total: Math.round(tc + match + ref + matrix30),
      oneTimeBonus: r.oneTimeBonus,
      matchingCap: r.matchingMaxPerMonth,
    }
  })

  return NextResponse.json({
    goal,
    month: latestMonth,
    member: { id: rootId, name: session.name },

    // Current state
    current: {
      position: currentPosition,
      minorVolCumulative: minorVol,
      majorVolCumulative: majorVol,
      currMinorMonthly,
      currMonthL,
      currMonthR,
      leftActiveFA,
      rightActiveFA,
      totalActiveFA: activeInSubtree,
      estimatedMonthlyIncome: currentMonthlyIncome,
      teamComm: Math.round(currentTeamComm),
      matching: Math.round(currentMatching),
      referral: Math.round(currentReferral),
      matrixBonus: Math.round(currentMatrix),
      newMembersThisMonth: newMembersCount,
    },

    // Matrix Bonus table (all levels)
    matrixLevels: MATRIX_LEVELS,

    // Target plan
    plan: {
      ...plan,
      months_to_target: milestones.length > 0 ? milestones[milestones.length - 1].monthsFromNow : 0,
      recommendedRank: {
        rank: plan.recommendedRank.rank,
        rankTH: plan.recommendedRank.rankTH,
        minorBVRequired: plan.recommendedRank.minorBVRequired,
        activeFARequired: plan.recommendedRank.activeFARequired,
        oneTimeBonus: plan.recommendedRank.oneTimeBonus,
      },
    },

    // Gap
    gap: { gapMinorBV, gapActiveFA, gapIncome, incomeProgressPct },

    // Road to goal
    milestones,

    // Coach actions
    coachActions,

    // All rank income potentials
    allRankPotentials,

    rankProgress: {
      current: { rank: rankProgress.current.rank, rankTH: rankProgress.current.rankTH },
      next: { rank: rankProgress.next.rank, rankTH: rankProgress.next.rankTH, minorBVRequired: rankProgress.next.minorBVRequired, activeFARequired: rankProgress.next.activeFARequired },
      volPct: rankProgress.volPct,
      faPct: rankProgress.faPct,
    },
  })
}
