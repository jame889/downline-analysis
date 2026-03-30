// ── SPS Compensation Plan Constants ──────────────────────────────────────────
// Based on official SPS marketing plan

export const PACK_BV = {
  starter: 200,   // Pack 10,000 THB
  pro: 500,       // Pack 25,000 THB
} as const

export const MAINTAIN_BV = 30  // BV/month to maintain FA status
export const PAIR_BV = 200     // BV per pair match
export const PAIR_VALUE = 1000 // THB per pair (200 BV × 5)

// Team Commission = Minor BV × 5 THB
export const TEAM_COMMISSION_RATE = 5 // THB per BV (minor leg)
export const TEAM_COMMISSION_MAX = 2_500_000 // THB/month cap

// Referral Bonus = BV × 20% × 25 THB = BV × 5 THB
export const REFERRAL_RATE = 5 // THB per BV of recruit's pack

// ── Rank Table ────────────────────────────────────────────────────────────────
export interface RankInfo {
  rank: string
  rankTH: string
  minorBVRequired: number      // each side must reach this
  activeFARequired: number     // each side
  placementRank?: string       // required rank in placement tree
  oneTimeBonus: number         // THB
  // Leadership Check Matching
  matchingGen1Pct: number
  matchingGen2Pct: number
  matchingGen3Pct: number
  matchingGen4Pct: number
  matchingMaxPerMonth: number  // 0 = unlimited
}

export const RANKS: RankInfo[] = [
  { rank: 'FA',          rankTH: 'FA (ตัวแทน)',    minorBVRequired: 0,         activeFARequired: 0,    oneTimeBonus: 0,         matchingGen1Pct: 0,  matchingGen2Pct: 0,  matchingGen3Pct: 0, matchingGen4Pct: 0, matchingMaxPerMonth: 0 },
  { rank: 'STAR',        rankTH: 'Star',            minorBVRequired: 1_000,     activeFARequired: 2,    oneTimeBonus: 2_500,     matchingGen1Pct: 20, matchingGen2Pct: 0,  matchingGen3Pct: 0, matchingGen4Pct: 0, matchingMaxPerMonth: 5_000 },
  { rank: 'BRONZE',      rankTH: 'Bronze',          minorBVRequired: 2_000,     activeFARequired: 4,    oneTimeBonus: 5_000,     matchingGen1Pct: 20, matchingGen2Pct: 0,  matchingGen3Pct: 0, matchingGen4Pct: 0, matchingMaxPerMonth: 12_500 },
  { rank: 'SILVER',      rankTH: 'Silver',          minorBVRequired: 5_000,     activeFARequired: 10,   oneTimeBonus: 12_500,    matchingGen1Pct: 20, matchingGen2Pct: 0,  matchingGen3Pct: 0, matchingGen4Pct: 0, matchingMaxPerMonth: 25_000 },
  { rank: 'GOLD',        rankTH: 'Gold',            minorBVRequired: 8_000,     activeFARequired: 16,   oneTimeBonus: 25_000,    matchingGen1Pct: 20, matchingGen2Pct: 10, matchingGen3Pct: 0, matchingGen4Pct: 0, matchingMaxPerMonth: 37_500 },
  { rank: 'PLATINUM',    rankTH: 'Platinum',        minorBVRequired: 15_000,    activeFARequired: 30,   oneTimeBonus: 37_500,    matchingGen1Pct: 20, matchingGen2Pct: 10, matchingGen3Pct: 10, matchingGen4Pct: 0, matchingMaxPerMonth: 50_000 },
  { rank: 'RUBY',        rankTH: 'Ruby',            minorBVRequired: 25_000,    activeFARequired: 50,   oneTimeBonus: 62_500,    matchingGen1Pct: 20, matchingGen2Pct: 10, matchingGen3Pct: 10, matchingGen4Pct: 0, matchingMaxPerMonth: 62_500 },
  { rank: 'DIAMOND',     rankTH: 'Diamond',         minorBVRequired: 50_000,    activeFARequired: 100,  oneTimeBonus: 125_000,   matchingGen1Pct: 20, matchingGen2Pct: 10, matchingGen3Pct: 10, matchingGen4Pct: 10, matchingMaxPerMonth: 0 },
  { rank: 'BLUE_DIAMOND',rankTH: 'Blue Diamond',    minorBVRequired: 100_000,   activeFARequired: 200,  oneTimeBonus: 500_000,   matchingGen1Pct: 20, matchingGen2Pct: 10, matchingGen3Pct: 10, matchingGen4Pct: 10, matchingMaxPerMonth: 0 },
  { rank: 'RED_DIAMOND', rankTH: 'Red Diamond',     minorBVRequired: 200_000,   activeFARequired: 400,  oneTimeBonus: 1_250_000, matchingGen1Pct: 20, matchingGen2Pct: 10, matchingGen3Pct: 10, matchingGen4Pct: 10, matchingMaxPerMonth: 0 },
  { rank: 'CROWN',       rankTH: 'Crown',           minorBVRequired: 400_000,   activeFARequired: 800,  oneTimeBonus: 2_500_000, matchingGen1Pct: 20, matchingGen2Pct: 10, matchingGen3Pct: 10, matchingGen4Pct: 10, matchingMaxPerMonth: 0 },
  { rank: 'CROWN_ROYAL', rankTH: 'Crown Royal',     minorBVRequired: 1_000_000, activeFARequired: 2000, oneTimeBonus: 7_500_000, matchingGen1Pct: 20, matchingGen2Pct: 10, matchingGen3Pct: 10, matchingGen4Pct: 10, matchingMaxPerMonth: 0 },
]

export function getRankInfo(rank: string): RankInfo {
  return RANKS.find((r) => r.rank === rank) ?? RANKS[0]
}

export function getNextRank(currentRank: string): RankInfo | null {
  const idx = RANKS.findIndex((r) => r.rank === currentRank)
  if (idx < 0 || idx >= RANKS.length - 1) return null
  return RANKS[idx + 1]
}

// ── Income Calculator ─────────────────────────────────────────────────────────

/** Monthly Team Commission from weak leg BV */
export function calcTeamCommission(minorBVMonthly: number): number {
  return Math.min(minorBVMonthly * TEAM_COMMISSION_RATE, TEAM_COMMISSION_MAX)
}

/** Referral Bonus from recruiting N people with given pack BV */
export function calcReferralBonus(recruits: number, packBV = 500): number {
  return recruits * packBV * REFERRAL_RATE
}

/** Leadership Matching Bonus estimate */
export function calcMatchingBonus(rank: RankInfo, gen1TeamCommission: number): number {
  const raw = gen1TeamCommission * (rank.matchingGen1Pct / 100)
  if (rank.matchingMaxPerMonth === 0) return raw
  return Math.min(raw, rank.matchingMaxPerMonth)
}

/** Given a monthly income target (THB), find the required rank and structure */
export function planForTarget(targetMonthly: number): {
  targetMonthly: number
  recommendedRank: RankInfo
  requiredMinorBVMonthly: number
  requiredActiveFAEachSide: number
  teamCommission: number
  matchingBonus: number
  referralBonus: number
  total: number
  months_to_target: number
  breakdown: { source: string; amount: number; pct: number }[]
} {
  // Strategy: Team Commission is the primary income source
  // Find rank whose minor BV × 5 ≥ target after adding matching
  let chosen = RANKS[RANKS.length - 1]
  for (const rank of RANKS) {
    const teamComm = calcTeamCommission(rank.minorBVRequired)
    const matching = calcMatchingBonus(rank, teamComm * 0.5) // assume gen1 earns 50% of your rate
    const recruits = rank.activeFARequired * 2 // both sides
    const referral = calcReferralBonus(recruits / 12) // monthly average
    const total = teamComm + matching + referral
    if (total >= targetMonthly) {
      chosen = rank
      break
    }
  }

  const teamComm = calcTeamCommission(chosen.minorBVRequired)
  const matching = calcMatchingBonus(chosen, teamComm * 0.5)
  const referral = calcReferralBonus((chosen.activeFARequired * 2) / 12)
  const total = teamComm + matching + referral

  const breakdown = [
    { source: 'ค่าทีม (Team Commission)', amount: teamComm, pct: Math.round((teamComm / total) * 100) },
    { source: 'Leadership Matching', amount: Math.round(matching), pct: Math.round((matching / total) * 100) },
    { source: 'Referral Bonus', amount: Math.round(referral), pct: Math.round((referral / total) * 100) },
  ]

  return {
    targetMonthly,
    recommendedRank: chosen,
    requiredMinorBVMonthly: chosen.minorBVRequired,
    requiredActiveFAEachSide: chosen.activeFARequired,
    teamCommission: teamComm,
    matchingBonus: Math.round(matching),
    referralBonus: Math.round(referral),
    total: Math.round(total),
    months_to_target: 0, // calculated with current data
    breakdown,
  }
}

// ── Matrix Bonus ──────────────────────────────────────────────────────────────
// Binary 2×N matrix — each person sponsors 2, those sponsor 2, etc.
// Matrix Bonus = 30 THB per active member in your matrix (all levels)
// Max payout: 5.24 million THB/month
// Paid on 15th of next month — FA must be Active & Qualified

export const MATRIX_BONUS_PER_ACTIVE = 30 // THB per active member
export const MATRIX_BONUS_MAX = 5_240_000  // THB/month cap

export interface MatrixLevel {
  rank: string
  rankTH: string
  matrixDepth: number       // levels deep
  requiredActive: number    // total active in matrix
  potentialBonus: number    // THB/month at full matrix
}

export const MATRIX_LEVELS: MatrixLevel[] = [
  { rank: 'STAR',          rankTH: 'Star',          matrixDepth: 4,     requiredActive: 30,      potentialBonus: 30 * 30 },
  { rank: 'BRONZE',        rankTH: 'Bronze',         matrixDepth: 5,     requiredActive: 62,      potentialBonus: 62 * 30 },
  { rank: 'SILVER',        rankTH: 'Silver',         matrixDepth: 6,     requiredActive: 126,     potentialBonus: 126 * 30 },
  { rank: 'GOLD',          rankTH: 'Gold',           matrixDepth: 7,     requiredActive: 254,     potentialBonus: 254 * 30 },
  { rank: 'PLATINUM',      rankTH: 'Platinum',       matrixDepth: 8,     requiredActive: 510,     potentialBonus: 510 * 30 },
  { rank: 'RUBY',          rankTH: 'Ruby',           matrixDepth: 9,     requiredActive: 1_022,   potentialBonus: 1_022 * 30 },
  { rank: 'DIAMOND',       rankTH: 'Diamond',        matrixDepth: 10,    requiredActive: 2_046,   potentialBonus: 2_046 * 30 },
  { rank: 'BLUE_DIAMOND',  rankTH: 'Blue Diamond',   matrixDepth: 12,    requiredActive: 8_190,   potentialBonus: 8_190 * 30 },
  { rank: 'RED_DIAMOND',   rankTH: 'Red Diamond',    matrixDepth: 14,    requiredActive: 32_766,  potentialBonus: 32_766 * 30 },
  { rank: 'CROWN',         rankTH: 'Crown',          matrixDepth: 15,    requiredActive: 65_534,  potentialBonus: 65_534 * 30 },
  { rank: 'CROWN_ROYAL',   rankTH: 'Crown Royal',    matrixDepth: 16,    requiredActive: 131_070, potentialBonus: Math.min(131_070 * 30, 5_240_000) },
  { rank: 'CR_AMBASSADOR', rankTH: 'Cr. Ambassador', matrixDepth: 16,    requiredActive: 131_070, potentialBonus: Math.min(131_070 * 30, 5_240_000) },
]

/** Calculate Matrix Bonus from actual active count in your subtree */
export function calcMatrixBonus(activeInMatrix: number, rank: string): number {
  const ml = MATRIX_LEVELS.find((m) => m.rank === rank)
  const maxActive = ml?.requiredActive ?? activeInMatrix
  const billable = Math.min(activeInMatrix, maxActive)
  return Math.min(billable * MATRIX_BONUS_PER_ACTIVE, MATRIX_BONUS_MAX)
}

/** Get Matrix Level info for a rank */
export function getMatrixLevel(rank: string): MatrixLevel | null {
  return MATRIX_LEVELS.find((m) => m.rank === rank) ?? null
}

// ── Combined income estimate ──────────────────────────────────────────────────
export interface IncomeEstimate {
  teamCommission: number
  referralBonus: number
  matchingBonus: number
  matrixBonus: number
  rankBonus: number // one-time, amortized
  total: number
}

export function estimateFullIncome(
  rank: string,
  minorBVMonthly: number,
  activeInMatrix: number,
  recruitsThisMonth: number,
  gen1TeamCommission: number
): IncomeEstimate {
  const rankInfo = getRankInfo(rank)
  const teamComm = calcTeamCommission(minorBVMonthly)
  const referral = calcReferralBonus(recruitsThisMonth, 500)
  const matching = calcMatchingBonus(rankInfo, gen1TeamCommission)
  const matrix = calcMatrixBonus(activeInMatrix, rank)
  const total = teamComm + referral + matching + matrix
  return { teamCommission: teamComm, referralBonus: referral, matchingBonus: matching, matrixBonus: matrix, rankBonus: 0, total }
}

// ── Rank progress from current vol ───────────────────────────────────────────
export function getCurrentRankProgress(minorVolCumulative: number, activeFACount: number) {
  let current = RANKS[0]
  let next = RANKS[1]
  for (let i = 0; i < RANKS.length; i++) {
    if (
      minorVolCumulative >= RANKS[i].minorBVRequired &&
      activeFACount >= RANKS[i].activeFARequired
    ) {
      current = RANKS[i]
      next = RANKS[i + 1] ?? RANKS[i]
    }
  }
  const volPct = next.minorBVRequired > 0
    ? Math.min(100, Math.round((minorVolCumulative / next.minorBVRequired) * 100))
    : 100
  const faPct = next.activeFARequired > 0
    ? Math.min(100, Math.round((activeFACount / next.activeFARequired) * 100))
    : 100
  return { current, next, volPct, faPct }
}
