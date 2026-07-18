import { generateCoachReply, type AiMessage } from './coach-ai'
import { getAllMembers, getAvailableMonths, getReportsForMonths, getSubtreeIds } from './db'
import { getDailyActivityAnalysis } from './daily-activities'
import { getGrowthDashboardData } from './growth'
import {
  analyzeKeymanStructure,
  type KeymanAnalysis,
  type KeymanStructureAnalysis,
  type PlacementLegAnalysis,
} from './keyman-analysis'

type ConversationMessage = { role: 'user' | 'assistant'; content: string }

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function formatTrend(value: number | null): string {
  if (value === null) return 'ยังไม่มีเดือนก่อนให้เทียบ'
  return `${value >= 0 ? '+' : ''}${value}% จากเดือนก่อน`
}

function formatPlacementLeg(leg: PlacementLegAnalysis): string {
  const keyman = leg.keymanId && leg.keymanName
    ? `${leg.keymanName} (${leg.keymanId})`
    : 'ยังไม่มี Placement Keyman'
  return [
    `ฝั่ง${leg.side}: ${keyman}`,
    `BV สะสม ${formatNumber(leg.accumulatedBv)} · New BV ${formatNumber(leg.newBv)} (${formatTrend(leg.trendPct)}) · สัดส่วนการโต ${leg.contributionPct}%`,
    `ทีมลึก ${leg.teamSize} คน · Active ${leg.activeMembers} คน (${leg.activeRatePct}%)`,
    `คอขวด: ${leg.bottlenecks.join(', ')}`,
  ].join('\n')
}

function keymanRankLine(item: KeymanAnalysis, index: number): string {
  const gap = item.closestRank
  const target = gap
    ? `ใกล้ ${gap.label} ${gap.progressPct}% · ขาด BV ซ้าย ${formatNumber(gap.leftGap)} / ขวา ${formatNumber(gap.rightGap)} · ขาด Active FA ซ้าย ${gap.activeLeftGap} / ขวา ${gap.activeRightGap}`
    : 'ผ่าน Silver แล้ว'
  return `${index + 1}. ${item.name} (${item.id}) · ฝั่ง${item.side} · ${item.position}\n   BV สะสมซ้าย/ขวา ${formatNumber(item.leftBv)}/${formatNumber(item.rightBv)} · New BV ${formatNumber(item.newBv)} (${formatTrend(item.trendPct)})\n   ${target}\n   Action: ${item.recommendedAction}`
}

export function formatKeymanStructureReply(
  latestMonth: string,
  analysis: KeymanStructureAnalysis,
  limitPerSide = 5,
): string {
  return [
    `AI วิเคราะห์โครงสร้างซ้าย-ขวา เดือน ${latestMonth}`,
    'คำนวณจาก Placement Tree (Upline) ไม่ได้จัดฝั่งจาก Sponsor',
    '',
    formatPlacementLeg(analysis.legs.left),
    '',
    formatPlacementLeg(analysis.legs.right),
    '',
    'Keyman ที่ควรเร่งฝั่งซ้าย',
    ...(analysis.left.length ? analysis.left.slice(0, limitPerSide).map(keymanRankLine) : ['ยังไม่มี Keyman ที่มีข้อมูลผลงาน']),
    '',
    'Keyman ที่ควรเร่งฝั่งขวา',
    ...(analysis.right.length ? analysis.right.slice(0, limitPerSide).map(keymanRankLine) : ['ยังไม่มี Keyman ที่มีข้อมูลผลงาน']),
    '',
    'Action: เริ่มจากฝั่งที่ New BV ลดลงหรือ Active Rate ต่ำ แล้วโค้ชคนที่ใกล้ตำแหน่งที่สุดทุก 48 ชั่วโมง',
  ].join('\n')
}

export async function buildTelegramCoachReply(
  memberId: string,
  question: string,
  history: ConversationMessage[] = []
): Promise<string> {
  const months = await getAvailableMonths()
  const latestMonth = months[0]
  if (!latestMonth) return 'ยังไม่มีข้อมูล Business Report สำหรับวิเคราะห์ครับ'

  const previousMonth = months[1]
  const reportMonths = [latestMonth, previousMonth].filter(Boolean) as string[]
  const [members, reportsByMonth, growth, activity] = await Promise.all([
    getAllMembers(),
    getReportsForMonths(reportMonths),
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
  const keymanStructure = analyzeKeymanStructure(
    memberId,
    members,
    reports,
    previousMonth ? reportsByMonth[previousMonth] ?? [] : [],
  )
  if (/key\s*man|คีย์\s*แมน|โครงสร้าง.*(?:ซ้าย|ขวา)|องค์กรโตจากใคร|คะแนน(?:สะสม)?ซ้ายขวา|(?:ใกล้|ขาด|ขึ้น|ตำแหน่ง).*?(?:star|bronze|silver|สตาร์|บรอนซ์|ซิลเวอร์)|(?:star|bronze|silver|สตาร์|บรอนซ์|ซิลเวอร์).*?(?:ใคร|ขาด|อีกเท่าไร)/i.test(question)) {
    return formatKeymanStructureReply(latestMonth, keymanStructure)
  }
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
    for (const item of aliases) output = output.replace(new RegExp(escapeRegExp(`${item.name} (${item.id})`), 'gi'), item.token)
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

Keyman ซ้าย–ขวา:
${[...keymanStructure.left.slice(0, 8), ...keymanStructure.right.slice(0, 8)].map((item) => {
  const gap = item.closestRank
  return `${item.name} (${item.id}) ฝั่ง${item.side}, ${item.position}, L/R ${formatNumber(item.leftBv)}/${formatNumber(item.rightBv)} BV, ${gap ? `ใกล้ ${gap.label} ${gap.progressPct}%, gap BV L/R ${formatNumber(gap.leftGap)}/${formatNumber(gap.rightGap)}, gap Active L/R ${gap.activeLeftGap}/${gap.activeRightGap}` : 'ผ่าน Silver'}, bottleneck ${item.bottlenecks.join(', ')}`
}).join('\n') || 'ยังไม่มีข้อมูล'}

ภาพรวม Placement Leg:
${formatPlacementLeg(keymanStructure.legs.left)}
${formatPlacementLeg(keymanStructure.legs.right)}

กิจกรรม 30 วัน: ${activity.recent30.totalActivities} ครั้ง ใน ${activity.recent30.activeDays} วัน · ซ้าย ${activity.recent30.leftParticipants} · ขวา ${activity.recent30.rightParticipants}
Funnel: Outreach ${activity.funnel.outreach} → นัด ${activity.funnel.appointments} → Meeting ${activity.funnel.meetings} → Sponsor ${activity.funnel.sponsors} → Start Up ${activity.funnel.startups}
Weekly Score: ${activity.weeklyScorecard.score}/100 (${activity.weeklyScorecard.grade})
Priority: ${activity.weeklyScorecard.summary}
กิจกรรมล่าสุด:
${recentActivities || 'ยังไม่มีบันทึก'}

ถ้าถามว่าควรทำงานกับใคร ให้ระบุชื่ออย่างน้อย 3 คนจาก Keyman หรือ Focus Candidates พร้อมฝั่ง Placement, Gap ตำแหน่ง, เหตุผล และงาน 7 วัน
การจัดฝั่งต้องอ้างอิง Placement/Upline เท่านั้น ห้ามใช้ Sponsor ตัดสินฝั่ง
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
