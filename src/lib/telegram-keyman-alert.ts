import { getAllMembers, getAvailableMonths, getMembersForMonth } from './db'
import { analyzeKeymanStructure, type KeymanAnalysis } from './keyman-analysis'
import { POSITION_RANK } from './types'

const TARGETS = [
  { code: 'ST', label: 'Star', bv: 1_000, gapLimit: 600 },
  { code: 'BR', label: 'Bronze', bv: 2_000, gapLimit: 1_200 },
  { code: 'SV', label: 'Silver', bv: 5_000, gapLimit: 3_000 },
  { code: 'GD', label: 'Gold', bv: 8_000, gapLimit: 4_000 },
] as const

type Target = (typeof TARGETS)[number]
type Candidate = { keyman: KeymanAnalysis; target: Target; weakBv: number; gap: number }

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function nextTarget(keyman: KeymanAnalysis): Target | null {
  const rank = POSITION_RANK[keyman.position] ?? POSITION_RANK[keyman.highestPosition] ?? 0
  return TARGETS.find((target) => rank < POSITION_RANK[target.code]) ?? null
}

export async function buildKeymanGoalAlertMessage(memberId: string): Promise<string> {
  const months = (await getAvailableMonths()).slice().sort()
  const month = months[months.length - 1]
  if (!month) return '<b>Keyman ใกล้เป้าหมาย</b>\n\nไม่มีข้อมูลรายเดือน'

  const [allMembers, monthMembers] = await Promise.all([
    getAllMembers(),
    getMembersForMonth(month),
  ])
  const structure = analyzeKeymanStructure(
    memberId,
    allMembers,
    monthMembers.map((item) => item.report),
  )
  const keymen = [...structure.left, ...structure.right, ...structure.unknown]
  const candidates: Candidate[] = keymen.flatMap((keyman) => {
    const target = nextTarget(keyman)
    if (!target) return []
    const weakBv = Math.min(keyman.leftBv, keyman.rightBv)
    const gap = Math.max(0, target.bv - weakBv)
    return gap < target.gapLimit ? [{ keyman, target, weakBv, gap }] : []
  })

  const sections = TARGETS.flatMap((target) => {
    const group = candidates
      .filter((item) => item.target.code === target.code)
      .sort((a, b) => a.gap - b.gap || b.weakBv - a.weakBv)
    if (!group.length) return []

    const lines = group.slice(0, 5).map(({ keyman, weakBv, gap }) =>
      `- ${escapeHtml(keyman.name)} (${escapeHtml(keyman.id)}) · ฝั่ง${keyman.side} · ${keyman.isActive ? 'Active' : 'Inactive'}\n` +
      `  Weak ${weakBv.toLocaleString()} BV · ขาด ${gap.toLocaleString()} BV`)
    if (group.length > 5) lines.push(`- ... และอีก ${group.length - 5} คน`)
    return [`<b>${target.label}</b> · Gap &lt; ${target.gapLimit.toLocaleString()} BV (${group.length} คน)\n${lines.join('\n')}`]
  })

  if (!sections.length) {
    return `<b>Keyman ใกล้เป้าหมาย - ${month}</b>\n\nวันนี้ยังไม่มี Keyman เข้าเกณฑ์แจ้งเตือน`
  }

  return (
    `<b>Keyman ใกล้เป้าหมาย - ${month}</b>\n` +
    `เรียงจาก Gap ฝั่งอ่อนน้อยที่สุด\n\n` +
    sections.join('\n\n')
  )
}
