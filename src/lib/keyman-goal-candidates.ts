import { POSITION_RANK } from './types'

export const KEYMAN_GOAL_TARGETS = [
  { code: 'ST', label: 'Star', bv: 1_000, gapLimit: 600 },
  { code: 'BR', label: 'Bronze', bv: 2_000, gapLimit: 1_200 },
  { code: 'SV', label: 'Silver', bv: 5_000, gapLimit: 3_000 },
  { code: 'GD', label: 'Gold', bv: 8_000, gapLimit: 4_000 },
] as const

export type KeymanGoalTarget = (typeof KEYMAN_GOAL_TARGETS)[number]
export type KeymanGoalCode = KeymanGoalTarget['code']

export type KeymanGoalSource = {
  id: string
  name: string
  side: string
  position: string
  highestPosition?: string
  isActive: boolean
  leftBv: number
  rightBv: number
}

export type KeymanGoalCandidate = {
  keyman: KeymanGoalSource
  target: KeymanGoalTarget
  weakBv: number
  gap: number
}

function currentRank(item: KeymanGoalSource): number {
  return POSITION_RANK[item.position] ?? POSITION_RANK[item.highestPosition ?? ''] ?? 0
}

export function nextKeymanGoalTarget(item: KeymanGoalSource): KeymanGoalTarget | null {
  const rank = currentRank(item)
  return KEYMAN_GOAL_TARGETS.find((target) => rank < POSITION_RANK[target.code]) ?? null
}

export function getKeymanGoalCandidates(
  keymen: KeymanGoalSource[],
  targetCode?: KeymanGoalCode,
  gapLimitOverride?: number,
): KeymanGoalCandidate[] {
  return keymen.flatMap((keyman) => {
    const target = nextKeymanGoalTarget(keyman)
    if (!target || (targetCode && target.code !== targetCode)) return []
    const weakBv = Math.min(keyman.leftBv, keyman.rightBv)
    const gap = Math.max(0, target.bv - weakBv)
    const gapLimit = gapLimitOverride ?? target.gapLimit
    return gap < gapLimit ? [{ keyman, target, weakBv, gap }] : []
  }).sort((a, b) => a.gap - b.gap || b.weakBv - a.weakBv || a.keyman.id.localeCompare(b.keyman.id))
}

function parseRank(question: string): KeymanGoalCode | null {
  if (/\b(?:star|st)\b|สตาร์/i.test(question)) return 'ST'
  if (/\b(?:bronze|br)\b|บรอนซ์/i.test(question)) return 'BR'
  if (/\b(?:silver|sv)\b|ซิลเวอร์/i.test(question)) return 'SV'
  if (/\b(?:gold|gd)\b|โกลด์/i.test(question)) return 'GD'
  return null
}

function parseGapLimit(question: string): number | undefined {
  const normalized = question.replace(/,/g, '')
  const match =
    normalized.match(/\bgap\s*(?:bv)?\s*(?:<|<=|≤|ไม่เกิน)?\s*(\d{2,6})/i)
    ?? normalized.match(/(?:<|<=|≤)\s*(\d{2,6})\s*(?:bv|คะแนน)?/i)
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : undefined
}

export type KeymanGoalQuery = { targetCode: KeymanGoalCode; gapLimit?: number }

export function parseKeymanGoalQuery(question: string): KeymanGoalQuery | null {
  const targetCode = parseRank(question)
  if (!targetCode) return null
  if (!/(?:รายชื่อ|ทั้งหมด|ใกล้เป้าหมาย|\bgap\b|ขาด.*?(?:bv|คะแนน))/i.test(question)) return null
  return { targetCode, gapLimit: parseGapLimit(question) }
}

export function formatKeymanGoalQueryReply(
  question: string,
  keymen: KeymanGoalSource[],
  month?: string,
): string | null {
  const query = parseKeymanGoalQuery(question)
  if (!query) return null
  const target = KEYMAN_GOAL_TARGETS.find((item) => item.code === query.targetCode)!
  const gapLimit = query.gapLimit ?? target.gapLimit
  const candidates = getKeymanGoalCandidates(keymen, query.targetCode, gapLimit)
  const heading = `${target.label} · Gap < ${gapLimit.toLocaleString()} BV (${candidates.length} คน)`
  if (!candidates.length) {
    return [month ? `Keyman ใกล้เป้าหมาย - ${month}` : 'Keyman ใกล้เป้าหมาย', heading, 'ไม่พบสมาชิกที่เข้าเกณฑ์'].join('\n')
  }
  return [
    month ? `Keyman ใกล้เป้าหมาย - ${month}` : 'Keyman ใกล้เป้าหมาย',
    heading,
    'เรียงจาก Gap ฝั่งอ่อนน้อยที่สุด',
    '',
    ...candidates.map(({ keyman, weakBv, gap }, index) =>
      `${index + 1}. ${keyman.name} (${keyman.id}) · ฝั่ง${keyman.side} · ${keyman.isActive ? 'Active' : 'Inactive'}\n   Weak ${weakBv.toLocaleString()} BV · ขาด ${gap.toLocaleString()} BV`
    ),
  ].join('\n')
}
