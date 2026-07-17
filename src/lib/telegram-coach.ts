import { generateCoachReply, type AiMessage } from './coach-ai'
import { getAllMembers, getAvailableMonths, getReportsForMonths, getSubtreeIds } from './db'
import { getDailyActivityAnalysis } from './daily-activities'
import { getGrowthDashboardData } from './growth'

type ConversationMessage = { role: 'user' | 'assistant'; content: string }

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export async function buildTelegramCoachReply(
  memberId: string,
  question: string,
  history: ConversationMessage[] = []
): Promise<string> {
  const months = await getAvailableMonths()
  const latestMonth = months[0]
  if (!latestMonth) return 'ยังไม่มีข้อมูล Business Report สำหรับวิเคราะห์ครับ'

  const [members, reportsByMonth, growth, activity] = await Promise.all([
    getAllMembers(),
    getReportsForMonths([latestMonth]),
    getGrowthDashboardData(memberId, 9),
    getDailyActivityAnalysis(memberId),
  ])
  const reports = reportsByMonth[latestMonth] ?? []
  const reportMap = new Map(reports.map((report) => [report.member_id, report]))
  const member = members[memberId]
  const myReport = reportMap.get(memberId)
  if (!member || !myReport) return 'ยังไม่พบข้อมูลสมาชิกใน Business Report ล่าสุดครับ'

  const subtreeIds = getSubtreeIds(memberId, members)
  const directory = Array.from(subtreeIds)
    .map((id) => members[id])
    .filter(Boolean)
  const idMatch = question.match(/\b\d{5,}\b/)?.[0]
  const normalizedQuestion = question.toLowerCase()
  const mentioned = directory.find((item) => item.id === idMatch)
    ?? directory.slice().sort((a, b) => b.name.length - a.name.length)
      .find((item) => normalizedQuestion.includes(item.name.toLowerCase()))
  if (mentioned && /sponsor|ผู้แนะนำ|ใครแนะนำ|upline|อัพไลน์|อัปไลน์/i.test(question)) {
    const sponsor = mentioned.sponsor_id ? members[mentioned.sponsor_id] : null
    const upline = mentioned.upline_id ? members[mentioned.upline_id] : null
    const report = reportMap.get(mentioned.id)
    return [
      `${mentioned.name} (${mentioned.id})`,
      `ผู้แนะนำ/Sponsor: ${sponsor ? `${sponsor.name} (${sponsor.id})` : 'ไม่มีข้อมูล'}`,
      `Upline/Placement: ${upline ? `${upline.name} (${upline.id})` : 'ไม่มีข้อมูล'}`,
      `สถานะ: ${report?.is_active ? 'Active' : 'Inactive'} · ${report?.income_position ?? report?.highest_position ?? 'FA'}`,
    ].join('\n')
  }

  const candidates = growth?.focusCandidates.slice(0, 8) ?? []
  if (/diamond|ไดมอนด์/i.test(question) && /ใคร|คนไหน|ทำงาน|ลงไป/i.test(question) && candidates.length) {
    const diamond = growth!.diamond
    return [
      `ตอบตรงๆ: ลงไปทำงานกับ ${candidates[0].name} (${candidates[0].id}) เป็นคนแรก`,
      `Diamond Gap: ซ้าย ${formatNumber(diamond.leftGap)} BV · ขวา ${formatNumber(diamond.rightGap)} BV`,
      ...candidates.slice(0, 5).map((item, index) =>
        `${index + 1}. ${item.name} (${item.id}) · ฝั่ง${item.side} · score ${item.score}/100 · New BV ${formatNumber(item.latestNewVolume)} · ${item.recommendation}`
      ),
      '',
      'แผน 7 วัน: นัด 1:1 อันดับ 1-3, วางเป้า Weak Leg และติดตามผลทุก 48 ชั่วโมง',
    ].join('\n')
  }

  const aliases = directory.map((item, index) => ({
    id: item.id,
    name: item.name,
    token: `[MEMBER_${String(index + 1).padStart(3, '0')}]`,
  }))
  const protect = (input: string) => {
    let output = input
    for (const item of aliases) output = output.replace(new RegExp(`\\b${escapeRegExp(item.id)}\\b`, 'g'), item.token)
    for (const item of aliases.slice().sort((a, b) => b.name.length - a.name.length)) {
      output = output.replace(new RegExp(escapeRegExp(item.name), 'gi'), item.token)
    }
    return output
  }
  const restore = (input: string) => {
    let output = input
    for (const item of aliases) output = output.split(item.token).join(`${item.name} (${item.id})`)
    return output
  }

  const candidateLines = candidates.map((item, index) =>
    `${index + 1}. ${item.name} (${item.id}), ฝั่ง${item.side}, ${item.position}, score ${item.score}/100, New BV ${formatNumber(item.latestNewVolume)}, Sponsor 3 เดือน ${item.sponsorLast3}, Moving Up ${item.movingUpsLast3}, Active ${item.activeConsistency}%, action: ${item.recommendation}`
  ).join('\n')
  const recentActivities = activity.recentEntries.slice(0, 6).map((item) =>
    `${item.date} ${item.startTime} ${item.label}, ซ้าย ${item.leftCount}, ขวา ${item.rightCount}, ผล ${item.outcome}`
  ).join('\n')
  const systemPrompt = `คุณคือ Coach JOE ของ First Community ตอบภาษาไทย กระชับ เจาะจง และใช้ข้อมูลจริงเท่านั้น

สมาชิก: ${member.name} (${member.id}) · เดือน ${latestMonth}
BV ซ้าย/ขวา: ${formatNumber(myReport.total_vol_left)}/${formatNumber(myReport.total_vol_right)}
Weak Leg: ${growth?.weakSide ?? 'ไม่ทราบ'}
Gold Gap: ซ้าย ${formatNumber(growth?.gold.leftGap ?? 0)}, ขวา ${formatNumber(growth?.gold.rightGap ?? 0)}
Diamond Gap: ซ้าย ${formatNumber(growth?.diamond.leftGap ?? 0)}, ขวา ${formatNumber(growth?.diamond.rightGap ?? 0)}

Focus Candidates:
${candidateLines || 'ยังไม่มีข้อมูล'}

กิจกรรม 30 วัน: ${activity.recent30.totalActivities} ครั้ง ใน ${activity.recent30.activeDays} วัน · ซ้าย ${activity.recent30.leftParticipants} · ขวา ${activity.recent30.rightParticipants}
Funnel: Outreach ${activity.funnel.outreach} → นัด ${activity.funnel.appointments} → Meeting ${activity.funnel.meetings} → Sponsor ${activity.funnel.sponsors} → Start Up ${activity.funnel.startups}
Weekly Score: ${activity.weeklyScorecard.score}/100 (${activity.weeklyScorecard.grade})
Priority: ${activity.weeklyScorecard.summary}
กิจกรรมล่าสุด:
${recentActivities || 'ยังไม่มีบันทึก'}

ถ้าถามว่าควรทำงานกับใคร ให้ระบุชื่ออย่างน้อย 3 คนจาก Focus Candidates พร้อม score ตัวเลข เหตุผล และงาน 7 วัน
ห้ามตอบกว้าง ห้ามสร้างชื่อหรือข้อมูลที่ไม่มี และห้ามใช้ Markdown table`

  const aiMessages: AiMessage[] = [
    { role: 'system', content: protect(systemPrompt) },
    ...history.slice(-6).map((message) => ({ role: message.role, content: protect(message.content.slice(0, 1500)) })),
    { role: 'user', content: protect(question.slice(0, 2000)) },
  ]
  try {
    const result = await generateCoachReply(aiMessages)
    return restore(result.content).replace(/\[CHART:[^\]]+\]/g, '').trim()
  } catch (error) {
    console.warn('[telegram-coach] Cloud AI unavailable', error)
    const top = candidates[0]
    return [
      'ตอนนี้ Cloud AI ไม่ตอบ ผมสรุปจาก Coach Data Engine ให้ทันที:',
      `1. Weak Leg คือฝั่ง${growth?.weakSide ?? 'ที่อ่อนกว่า'}`,
      `2. Weekly Score ${activity.weeklyScorecard.score}/100 (${activity.weeklyScorecard.grade})`,
      `3. Priority: ${activity.weeklyScorecard.summary}`,
      top ? `4. คนที่ควรโค้ชก่อน: ${top.name} (${top.id}) score ${top.score}/100` : '4. ยังไม่มี Focus Candidate เพียงพอ',
    ].join('\n')
  }
}
