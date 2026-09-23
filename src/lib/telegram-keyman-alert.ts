import { getAllMembers, getAvailableMonths, getMembersForMonth } from './db'
import { analyzeKeymanStructure } from './keyman-analysis'
import { KEYMAN_GOAL_TARGETS, getKeymanGoalCandidates } from './keyman-goal-candidates'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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
  const candidates = getKeymanGoalCandidates(keymen)

  const sections = KEYMAN_GOAL_TARGETS.flatMap((target) => {
    const group = candidates.filter((item) => item.target.code === target.code)
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
