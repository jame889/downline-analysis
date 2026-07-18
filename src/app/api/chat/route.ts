import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'
import { generateCoachReply, getCoachAiHealth, type AiMessage } from '@/lib/coach-ai'
import { getSession } from '@/lib/auth'
import type { DailyActivityAnalysis } from '@/lib/daily-activities'

export const maxDuration = 60

const cleanEnv = (value: string | undefined) => value?.replace(/\\n|\n/g, '').replace(/^"|"$/g, '').trim() ?? ''

const KNOWLEDGE_DIR = path.join(process.cwd(), 'data', 'knowledge')

const SUPABASE_URL = cleanEnv(process.env.SUPABASE_URL)
const SUPABASE_KEY = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
const BUCKET = 'knowledge'
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY)

function errorDetails(error: unknown) {
  const value = error as { name?: string; message?: string; cause?: { code?: string; message?: string } }
  return {
    error: value?.message ?? String(error),
    code: value?.cause?.code ?? value?.name ?? 'UNKNOWN',
  }
}

export async function GET() {
  const providers = await getCoachAiHealth()
  const active = providers.find((provider) => provider.online)
  return Response.json({
    online: Boolean(active),
    provider: active?.provider ?? 'data',
    model: active?.model ?? 'Coach Data Engine',
    providers,
  }, { status: active ? 200 : 503 })
}

function sbHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  }
}

async function loadKnowledge(): Promise<string> {
  let docs: Array<{ title: string; content: string }> = []

  if (USE_SUPABASE) {
    try {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
        method: 'POST',
        headers: sbHeaders(),
        body: JSON.stringify({ prefix: '', limit: 200 }),
      })
      if (res.ok) {
        const files: { name: string }[] = await res.json()
        for (const f of files.filter(f => f.name.endsWith('.json'))) {
          const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${f.name}`, { headers: sbHeaders() })
          if (r.ok) {
            try { docs.push(await r.json()) } catch { /* skip */ }
          }
        }
      }
    } catch (error) {
      console.warn('[chat] skipped Supabase knowledge load', error)
    }
  }

  if (docs.length === 0) {
    if (!fs.existsSync(KNOWLEDGE_DIR)) return ''
    docs = fs.readdirSync(KNOWLEDGE_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf-8')) }
        catch { return null }
      })
      .filter(Boolean)
  }

  const excerpts = docs
    .slice(0, 4)
    .map(d => d.content ? `### ${d.title}\n${d.content.slice(0, 1500)}` : null)
    .filter(Boolean) as string[]
  if (!excerpts.length) return ''
  return `\n\n=== ฐานความรู้ด้านธุรกิจเครือข่าย Binary ===\n${excerpts.join('\n\n---\n\n')}`
}

function fallbackReply(coachData: Record<string, unknown> | null, messages: Array<{ role: string; content: string }>): string {
  const d = coachData as {
    balance?: { weakSide?: string; weakVol?: number; strongVol?: number; gapToBalance?: number; urgency?: string }
    actions?: Array<{ priority: string; category: string; title: string; detail: string }>
    safeLines?: number
    gen1?: unknown[]
    myPersonalSponsors?: number
    activityAnalysis?: DailyActivityAnalysis
    focusCandidates?: Array<{ id: string; name: string; side: string; score: number }>
  } | null
  const latestQuestion = messages[messages.length - 1]?.content ?? ''
  if (!d) return `Coach JOE กำลังใช้โหมดข้อมูลสำรองครับ\n\nคำถามของคุณ: ${latestQuestion}\n\nแนะนำให้ดู Balance, Weak Leg และ Action Priority ในหน้า Coach ก่อน แล้วลองส่งคำถามอีกครั้งภายหลัง`

  const weakSide = d.balance?.weakSide === 'L' ? 'ซ้าย' : d.balance?.weakSide === 'R' ? 'ขวา' : 'ที่อ่อนกว่า'
  const firstAction = d.actions?.[0]
  const activity = d.activityAnalysis
  const activityAction = d.actions?.find((item) => ['Consistency', 'Conversion', 'Result Gap', 'Weak Leg Focus'].includes(item.category))
  const focusPeople = d.focusCandidates
    ?.filter((item) => item.side === weakSide)
    .slice(0, 3)
    .map((item) => `${item.name} (${item.id}, score ${item.score})`)
    .join(', ')
  const sevenDayPlan = activity && activity.recent30.totalActivities >= 8 && (d.myPersonalSponsors ?? 0) === 0
    ? `รักษาปริมาณเดิม แต่เปลี่ยนเป็น Follow-up เชิงคุณภาพ: นัดทบทวน 3 ราย, Meeting 2 ครั้ง และ Start Up 1 ครั้ง โดยเน้นฝั่ง${weakSide}`
    : `ลงมืออย่างน้อย 3 วัน: Outreach 3 ครั้ง, Meeting 2 ครั้ง และ Start Up 1 ครั้ง โดยเน้นฝั่ง${weakSide}`
  return [
    'Cloud AI ยังไม่ตอบในรอบนี้ ผมจึงสรุปจาก Coach Data Engine ให้ทันที:',
    `1. Weak Leg คือสาย${weakSide} ขาดอีกประมาณ ${(d.balance?.gapToBalance ?? 0).toLocaleString()} BV เพื่อ Balance`,
    `2. Safe Zone ตอนนี้ ${d.safeLines ?? 0}/${d.gen1?.length ?? 0} สาย`,
    `3. สปอนเซอร์ส่วนตัวเดือนนี้ ${d.myPersonalSponsors ?? 0} คน`,
    activity
      ? `4. กิจกรรม 30 วัน: ${activity.recent30.totalActivities} ครั้ง ใน ${activity.recent30.activeDays} วัน · ทีมซ้าย ${activity.recent30.leftParticipants} คน · ทีมขวา ${activity.recent30.rightParticipants} คน`
      : '4. ยังไม่มีข้อมูลกิจกรรมรายวันสำหรับวิเคราะห์',
    activityAction
      ? `5. คอขวดจากกิจกรรม: ${activityAction.title} - ${activityAction.detail}`
      : firstAction ? `5. Priority แรก: ${firstAction.title} - ${firstAction.detail}` : '5. Priority แรก: ตรวจสายอ่อนและเลือกคนที่ต้องโค้ชใน 7 วัน',
    `6. แผน 7 วัน: ${sevenDayPlan}`,
    focusPeople ? `7. คนที่ควรทำงานด้วย: ${focusPeople}` : `7. เลือก Focus Candidate ในฝั่ง${weakSide}และติดตามผลทุก 48 ชั่วโมง`,
    '',
    'บันทึกผลทีมซ้าย–ขวาหลังจบทุกกิจกรรม เพื่อให้ Coach JOE ปรับแผนรอบถัดไป [CHART:balance]',
  ].join('\n')
}

function sanitizeActivityClaims(content: string, coachData: Record<string, unknown> | null): string {
  const activity = (coachData as { activityAnalysis?: DailyActivityAnalysis } | null)?.activityAnalysis
  if (!activity || activity.recent30.totalActivities > 0) return content

  return content
    .replace(/ไม่มีการลงมือทำเลย/g, 'ยังไม่มีบันทึกกิจกรรมในระบบ')
    .replace(/ไม่มีการลงมือทำ/g, 'ยังไม่มีบันทึกกิจกรรมในระบบ')
    .replace(/ปริมาณเป็นศูนย์/g, 'ข้อมูลกิจกรรมที่บันทึกยังเป็นศูนย์')
    .replace(/ไม่มี\s*(Outreach|Meeting)(?:\s*\/\s*(?:Outreach|Meeting))?\s*เลย/gi, 'ยังไม่มีบันทึก $1 ในระบบ')
}

function ndjsonResponse(content: string, provider = 'data') {
  return new Response(`${JSON.stringify({ message: { content } })}\n`, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Coach-Provider': provider,
    },
  })
}

function formatNumber(value: number | undefined) {
  return (value ?? 0).toLocaleString()
}

function isDiamondWorkQuestion(question: string) {
  const q = question.toLowerCase()
  return (
    (q.includes('diamond') || q.includes('ไดมอนด์')) &&
    (q.includes('ใคร') || q.includes('คนไหน') || q.includes('กับใคร') || q.includes('ลงไป') || q.includes('ทำงาน'))
  )
}

type MemberDirectoryEntry = {
  id: string
  name: string
  sponsorId: string | null
  sponsorName: string | null
  uplineId: string | null
  uplineName: string | null
  position: string | null
  isActive: boolean
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildMemberPrivacyFilter(coachData: Record<string, unknown> | null) {
  const d = coachData as {
    member?: { id?: string; name?: string }
    memberDirectory?: MemberDirectoryEntry[]
    gen1?: Array<{ id?: string; name?: string }>
    newMembers?: Array<{ id?: string; name?: string }>
    focusCandidates?: Array<{ id?: string; name?: string }>
    keymanStructure?: { left?: Array<{ id?: string; name?: string }>; right?: Array<{ id?: string; name?: string }> }
  } | null
  const members = new Map<string, string>()
  const add = (member: { id?: string; name?: string } | undefined) => {
    if (member?.id && member.name) members.set(member.id, member.name)
  }
  add(d?.member)
  d?.memberDirectory?.forEach(add)
  d?.gen1?.forEach(add)
  d?.newMembers?.forEach(add)
  d?.focusCandidates?.forEach(add)
  d?.keymanStructure?.left?.forEach(add)
  d?.keymanStructure?.right?.forEach(add)

  const aliases = Array.from(members, ([id, name], index) => ({
    id,
    name,
    token: `[MEMBER_${String(index + 1).padStart(3, '0')}]`,
  }))

  function protect(input: string) {
    let output = input
    for (const item of aliases) {
      output = output.replace(new RegExp(escapeRegExp(`${item.name} (${item.id})`), 'gi'), item.token)
    }
    for (const item of aliases) {
      output = output.replace(new RegExp(`\\b${escapeRegExp(item.id)}\\b`, 'g'), item.token)
    }
    for (const item of aliases.slice().sort((a, b) => b.name.length - a.name.length)) {
      output = output.replace(new RegExp(escapeRegExp(item.name), 'gi'), item.token)
    }
    return output
  }

  function restore(input: string) {
    let output = input
    for (const item of aliases) {
      const memberLabel = `${item.name} (${item.id})`
      output = output.split(item.token).join(memberLabel)
      output = output.split(item.token.slice(1, -1)).join(memberLabel)
    }
    return output
  }

  return { protect, restore }
}

type KeymanPromptEntry = {
  id: string; name: string; side: string; position: string; isActive: boolean
  leftBv: number; rightBv: number; newBv: number; activeLeft: number; activeRight: number
  teamSize: number; opportunityScore: number; bottlenecks: string[]
  closestRank: null | { label: string; progressPct: number; leftGap: number; rightGap: number; activeLeftGap: number; activeRightGap: number }
}

function isKeymanStructureQuestion(question: string) {
  return /keyman|คีย์แมน|คะแนนซ้ายขวา|ใกล้.*(?:star|bronze|silver|สตาร์|บรอนซ์|ซิลเวอร์)|ขาด.*(?:star|bronze|silver|สตาร์|บรอนซ์|ซิลเวอร์)/i.test(question)
}

function keymanStructureReply(coachData: Record<string, unknown>, question: string): string | null {
  if (!isKeymanStructureQuestion(question)) return null
  const d = coachData as { keymanStructure?: { left: KeymanPromptEntry[]; right: KeymanPromptEntry[] } }
  if (!d.keymanStructure) return null

  const format = (item: KeymanPromptEntry, index: number) => {
    const gap = item.closestRank
    const target = gap
      ? `ใกล้ ${gap.label} ${gap.progressPct}% · ขาด BV ซ้าย ${formatNumber(gap.leftGap)} / ขวา ${formatNumber(gap.rightGap)} · ขาด Active FA ซ้าย ${gap.activeLeftGap} / ขวา ${gap.activeRightGap}`
      : 'ผ่าน Silver แล้ว'
    return `${index + 1}. ${item.name} (${item.id}) · ${item.position} · L/R ${formatNumber(item.leftBv)}/${formatNumber(item.rightBv)} BV · New ${formatNumber(item.newBv)} BV\n   ${target}\n   จุดติดขัด: ${item.bottlenecks.join(', ')}`
  }
  const includeLeft = !/เฉพาะ.*ขวา|ฝั่งขวาเท่านั้น/i.test(question)
  const includeRight = !/เฉพาะ.*ซ้าย|ฝั่งซ้ายเท่านั้น/i.test(question)
  const lines = ['AI วิเคราะห์โครงสร้าง Keyman จาก Placement Tree เดือนล่าสุด']
  if (includeLeft) lines.push('', 'ฝั่งซ้าย', ...(d.keymanStructure.left.length ? d.keymanStructure.left.map(format) : ['ยังไม่มี Keyman ที่มีข้อมูลผลงาน']))
  if (includeRight) lines.push('', 'ฝั่งขวา', ...(d.keymanStructure.right.length ? d.keymanStructure.right.map(format) : ['ยังไม่มี Keyman ที่มีข้อมูลผลงาน']))
  lines.push('', 'ลำดับทำงาน: เริ่มจากคนที่เปอร์เซ็นต์ใกล้ตำแหน่งสูง แต่ยังขาดฝั่งอ่อนหรือ Active FA น้อยที่สุด แล้วติดตามทุก 48 ชั่วโมง [CHART:balance]')
  return lines.join('\n')
}

function isRelationshipQuestion(question: string) {
  const q = normalizeText(question)
  return (
    q.includes('ผู้แนะนำ') ||
    q.includes('ใครแนะนำ') ||
    q.includes('สปอนเซอร์') ||
    q.includes('sponsor') ||
    q.includes('upline') ||
    q.includes('อัพไลน์') ||
    q.includes('อัปไลน์')
  )
}

function findMentionedMember(question: string, directory: MemberDirectoryEntry[]) {
  const idMatch = question.match(/\b\d{5,}\b/)
  if (idMatch) {
    const byId = directory.find((member) => member.id === idMatch[0])
    if (byId) return byId
  }

  const q = normalizeText(question)
  return directory
    .slice()
    .sort((a, b) => b.name.length - a.name.length)
    .find((member) => q.includes(normalizeText(member.name)))
}

function relationshipReply(coachData: Record<string, unknown>, question: string): string | null {
  if (!isRelationshipQuestion(question)) return null
  const d = coachData as { memberDirectory?: MemberDirectoryEntry[] }
  const directory = d.memberDirectory ?? []
  const member = findMentionedMember(question, directory)
  if (!member) return null

  const asksUpline = /upline|อัพไลน์|อัปไลน์/i.test(question)
  const lines = [
    `${member.name} (${member.id})`,
    `ผู้แนะนำ/Sponsor: ${member.sponsorName && member.sponsorId ? `${member.sponsorName} (${member.sponsorId})` : 'ยังไม่มีข้อมูลในระบบ'}`,
    `Upline/Placement: ${member.uplineName && member.uplineId ? `${member.uplineName} (${member.uplineId})` : 'ยังไม่มีข้อมูลในระบบ'}`,
    `สถานะล่าสุด: ${member.isActive ? 'Active' : 'Inactive'}${member.position ? ` · ${member.position}` : ''}`,
  ]
  if (asksUpline) {
    return `ข้อมูล Placement ของ ${lines.join('\n')}`
  }
  return lines.join('\n')
}

function diamondWorkReply(coachData: Record<string, unknown>, question: string): string | null {
  if (!isDiamondWorkQuestion(question)) return null
  const d = coachData as {
    balance?: { weakSide?: string; gapToBalance?: number }
    diamond?: {
      currentLeft: number
      currentRight: number
      targetLeft: number
      targetRight: number
      leftGap: number
      rightGap: number
      leftPlacement: boolean
      rightPlacement: boolean
      requiredPlacement: string
    } | null
    focusCandidates?: Array<{
      id: string
      name: string
      side: string
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
      status: string
      recommendation: string
    }>
  }
  const diamond = d.diamond
  const weakSide = d.balance?.weakSide === 'L' ? 'ซ้าย' : d.balance?.weakSide === 'R' ? 'ขวา' : 'สายอ่อน'
  const rankedCandidates = d.focusCandidates ?? []
  const weakSideCandidates = rankedCandidates.filter((candidate) => candidate.side === weakSide)
  const candidates = [
    ...weakSideCandidates,
    ...rankedCandidates.filter((candidate) => candidate.side !== weakSide),
  ].slice(0, 5)
  if (!candidates.length) return null

  const gapLine = diamond
    ? `เป้า Diamond ต้องมี ${formatNumber(diamond.targetLeft)}/${formatNumber(diamond.targetRight)} BV ตอนนี้ขาดซ้าย ${formatNumber(diamond.leftGap)} BV, ขาดขวา ${formatNumber(diamond.rightGap)} BV และ Placement ต้องมี ${diamond.requiredPlacement} ทั้งสองฝั่ง (${diamond.leftPlacement ? 'ซ้ายผ่าน' : 'ซ้ายยังไม่ผ่าน'}, ${diamond.rightPlacement ? 'ขวาผ่าน' : 'ขวายังไม่ผ่าน'})`
    : `สาย${weakSide}ยังต้องเพิ่มประมาณ ${formatNumber(d.balance?.gapToBalance)} BV เพื่อ balance`

  const top = candidates[0]
  const people = candidates.map((c, index) => {
    const why = [
      `คะแนน ${c.score}/100`,
      `อยู่ฝั่ง${c.side}`,
      `${c.position}`,
      `New BV ล่าสุด ${formatNumber(c.latestNewVolume)}`,
      `สปอนเซอร์ 3 เดือน ${c.sponsorLast3}`,
      `Moving Up 3 เดือน ${c.movingUpsLast3}`,
      `สร้างผู้นำ ${c.leadersCreated}`,
      `Active ${c.activeConsistency}%`,
    ].join(' · ')
    return `${index + 1}. ${c.name} (${c.id}) — ${why}\n   งานที่ต้องทำ: ${c.recommendation}`
  }).join('\n')

  return [
    `ตอบตรงๆ: ถ้าจะดัน Diamond ตอนนี้ ให้ลงไปทำงานกับ ${top.name} เป็นคนแรกครับ`,
    '',
    gapLine,
    `ลำดับคนที่ควรลงไปทำงานด้วยใน 14 วันแรก:`,
    people,
    '',
    `แผน 7 วัน: นัด 1:1 กับอันดับ 1-3, วางเป้า BV ฝั่ง${weakSide}, ตรวจรายชื่อใหม่/คนรอ Start Up, แล้วตามผลทุก 48 ชั่วโมง [CHART:balance]`,
  ].join('\n')
}

async function buildSystemPrompt(coachData: Record<string, unknown> | null): Promise<string> {
  if (!coachData) {
    const knowledge = await loadKnowledge()
    return `คุณคือ Coach JOE ผู้เชี่ยวชาญด้านธุรกิจ First Community Binary ที่พูดภาษาไทย ตอบสั้น กระชับ และตรงประเด็น${knowledge}`
  }

  const d = coachData as {
    month?: string
    member?: { id: string; name: string }
    balance?: {
      L: number; R: number; total: number
      weakSide: string; weakVol: number; strongVol: number
      weakPct: number; gapToBalance: number
      urgency: string
    }
    gen1?: Array<{ id: string; name: string; is_active: boolean; depth: number; sub_count: number; active_in_sub: number; is_safe_zone: boolean }>
    safeLines?: number
    unsafeLines?: number
    newMembers?: Array<{ id: string; name: string; is_tapped: boolean }>
    actions?: Array<{ priority: string; category: string; title: string; detail: string }>
    myPersonalSponsors?: number
    byLevel?: Record<string, { total: number; active: number }>
    memberDirectory?: MemberDirectoryEntry[]
    diamond?: {
      currentLeft: number; currentRight: number; targetLeft: number; targetRight: number
      leftGap: number; rightGap: number; leftPlacement: boolean; rightPlacement: boolean
      requiredPlacement: string; qualified: boolean
    } | null
    focusCandidates?: Array<{
      id: string; name: string; side: string; position: string
      latestLeft: number; latestRight: number; latestNewVolume: number
      sponsorLast3: number; movingUpsLast3: number; leadersCreated: number
      activeConsistency: number; momentumRatio: number; score: number; status: string
      recommendation: string
    }>
    growthInsights?: string[]
    activityAnalysis?: DailyActivityAnalysis
    keymanStructure?: {
      left: KeymanPromptEntry[]
      right: KeymanPromptEntry[]
      closestToStar: KeymanPromptEntry[]
      closestToBronze: KeymanPromptEntry[]
      closestToSilver: KeymanPromptEntry[]
    }
  }

  const balanceStr = d.balance
    ? `Vol ซ้าย: ${d.balance.L.toLocaleString()}, Vol ขวา: ${d.balance.R.toLocaleString()}, Weak Leg: สาย${d.balance.weakSide === 'L' ? 'ซ้าย' : 'ขวา'} (${d.balance.weakVol.toLocaleString()}), ต้องเพิ่มอีก ${d.balance.gapToBalance.toLocaleString()} BV เพื่อ Balance, สถานะ: ${d.balance.urgency}`
    : ''

  const actionsStr = d.actions?.map(a => `[${a.priority}] ${a.title}: ${a.detail}`).join('\n') ?? ''

  const gen1Str = d.gen1?.map(g =>
    `${g.name} (${g.id}): ${g.is_active ? 'Active' : 'Inactive'}, ลึก ${g.depth} ชั้น, ทีม ${g.sub_count} คน, active ${g.active_in_sub} คน, ${g.is_safe_zone ? 'SAFE ZONE' : 'ต้องขุดต่อ'}`
  ).join('\n') ?? ''

  const newMemberStr = d.newMembers?.map(m =>
    `${m.name} (${m.id}): ${m.is_tapped ? 'ขุดลึกแล้ว' : 'ยังไม่ได้ขุดลึก'}`
  ).join('\n') ?? ''

  const diamondStr = d.diamond
    ? `Diamond target ${d.diamond.targetLeft.toLocaleString()}/${d.diamond.targetRight.toLocaleString()} BV, ปัจจุบันซ้าย ${d.diamond.currentLeft.toLocaleString()}, ขวา ${d.diamond.currentRight.toLocaleString()}, gap ซ้าย ${d.diamond.leftGap.toLocaleString()}, gap ขวา ${d.diamond.rightGap.toLocaleString()}, Placement ต้องมี ${d.diamond.requiredPlacement}: ซ้าย ${d.diamond.leftPlacement ? 'ผ่าน' : 'ยังไม่ผ่าน'}, ขวา ${d.diamond.rightPlacement ? 'ผ่าน' : 'ยังไม่ผ่าน'}, สถานะ ${d.diamond.qualified ? 'พร้อม' : 'ยังไม่พร้อม'}`
    : 'ยังไม่มีข้อมูล Diamond Readiness'

  const focusCandidateStr = d.focusCandidates?.slice(0, 8).map((c, index) =>
    `${index + 1}. ${c.name} (${c.id}) ฝั่ง${c.side}, ${c.position}, score ${c.score}/100, status ${c.status}, New BV ${c.latestNewVolume.toLocaleString()}, L/R ${c.latestLeft.toLocaleString()}/${c.latestRight.toLocaleString()}, sponsor3m ${c.sponsorLast3}, movingUp3m ${c.movingUpsLast3}, leaders ${c.leadersCreated}, active ${c.activeConsistency}%, momentum ${c.momentumRatio}x, action: ${c.recommendation}`
  ).join('\n') ?? ''

  const keymanLine = (c: KeymanPromptEntry, index: number) => {
    const gap = c.closestRank
    return `${index + 1}. ${c.name} (${c.id}), ${c.position}, L/R ${c.leftBv.toLocaleString()}/${c.rightBv.toLocaleString()} BV, New ${c.newBv.toLocaleString()} BV, Active L/R ${c.activeLeft}/${c.activeRight}, ทีม ${c.teamSize} คน, ${gap ? `ใกล้ ${gap.label} ${gap.progressPct}%, gap BV L/R ${gap.leftGap}/${gap.rightGap}, gap Active L/R ${gap.activeLeftGap}/${gap.activeRightGap}` : 'ผ่าน Silver'}, bottleneck: ${c.bottlenecks.join(', ')}`
  }
  const keymanStr = d.keymanStructure
    ? `ฝั่งซ้าย:\n${d.keymanStructure.left.map(keymanLine).join('\n') || 'ไม่มีข้อมูล'}\nฝั่งขวา:\n${d.keymanStructure.right.map(keymanLine).join('\n') || 'ไม่มีข้อมูล'}`
    : 'ยังไม่มีข้อมูล Keyman'

  const activity = d.activityAnalysis
  const activityTypeStr = activity?.typeBreakdown.map((item) =>
    `${item.label}: ${item.count} ครั้ง, ทีมซ้าย ${item.leftParticipants} คน, ทีมขวา ${item.rightParticipants} คน`
  ).join('\n') ?? ''
  const recentActivityStr = activity?.recentEntries.map((item) => {
    const detail = item.details.replace(/\s+/g, ' ').trim()
    return `${item.date} ${item.startTime} ${item.label}, สถานะ ${item.status}, ผล ${item.outcome}, ซ้าย ${item.leftCount}, ขวา ${item.rightCount}${item.contactName ? `, ผู้ติดต่อ: ${item.contactName}` : ''}${item.followUpDate ? `, Follow-up: ${item.followUpDate}` : ''}${detail ? `, รายละเอียด: ${detail}` : ''}${item.outcomeNotes ? `, หมายเหตุผล: ${item.outcomeNotes}` : ''}`
  }).join('\n') ?? ''
  const notificationStr = activity?.notifications.map((item) =>
    `[${item.severity}] ${item.title}: ${item.detail}${item.date ? ` (${item.date})` : ''}`
  ).join('\n') ?? ''
  const momentumText = activity?.momentumChangePct === null || activity?.momentumChangePct === undefined
    ? 'ยังเทียบแนวโน้มไม่ได้'
    : `${activity.momentumChangePct >= 0 ? '+' : ''}${activity.momentumChangePct}%`
  const activityStr = activity
    ? `ช่วง 30 วัน ${activity.recent30.startDate} ถึง ${activity.recent30.endDate}: ${activity.recent30.totalActivities} กิจกรรม ใน ${activity.recent30.activeDays} วัน (Consistency ${activity.recent30.consistencyPct}%)
Outreach ${activity.recent30.outreachCount}, Meeting/Event ${activity.recent30.meetingCount}, Start Up ${activity.recent30.startupCount}
ผู้เข้าร่วม/ผลทีม: ซ้าย ${activity.recent30.leftParticipants} คน, ขวา ${activity.recent30.rightParticipants} คน
7 วันล่าสุด ${activity.recent7.totalActivities} กิจกรรม เทียบ 7 วันก่อน ${activity.previous7.totalActivities} กิจกรรม, Momentum ${momentumText}
Streak ล่าสุด ${activity.currentStreakDays} วัน, กิจกรรมล่าสุด ${activity.lastActivityDate ?? 'ไม่มี'}
แผน 7 วันข้างหน้า: ${activity.upcoming7.totalActivities} กิจกรรม ใน ${activity.upcoming7.activeDays} วัน
Funnel: Outreach ${activity.funnel.outreach} → นัดหมาย ${activity.funnel.appointments} → Meeting ${activity.funnel.meetings} → Follow-up ${activity.funnel.followUps} → Sponsor ${activity.funnel.sponsors} → Start Up ${activity.funnel.startups}
Conversion: Outreach→นัด ${activity.funnel.outreachToAppointmentPct ?? 0}%, นัด→Meeting ${activity.funnel.appointmentToMeetingPct ?? 0}%, Meeting→Sponsor ${activity.funnel.meetingToSponsorPct ?? 0}%
แผนเทียบผลงาน 7 วัน: วางแผน ${activity.planVsActual.planned7}, ทำแล้ว ${activity.planVsActual.completed7}, ยกเลิก ${activity.planVsActual.cancelled7}, สำเร็จ ${activity.planVsActual.completionPct ?? 0}%
Weekly Scorecard: ${activity.weeklyScorecard.score}/100 เกรด ${activity.weeklyScorecard.grade} (Consistency ${activity.weeklyScorecard.consistencyScore}/25, Conversion ${activity.weeklyScorecard.conversionScore}/25, Weak Leg ${activity.weeklyScorecard.weakSide === 'L' ? 'ซ้าย' : 'ขวา'} ${activity.weeklyScorecard.weakLegScore}/20 จากผู้เข้าร่วม ${activity.weeklyScorecard.weakLegParticipants} คน, Sponsor ${activity.weeklyScorecard.sponsorScore}/15, Start Up ${activity.weeklyScorecard.startupScore}/15)
สิ่งสำคัญที่สุด: ${activity.weeklyScorecard.summary}

งานเตือน/งานค้าง:
${notificationStr || 'ไม่มีงานค้าง'}

แยกตามประเภท:
${activityTypeStr || 'ยังไม่มีข้อมูล'}

รายการล่าสุด:
${recentActivityStr || 'ยังไม่มีข้อมูล'}`
    : 'ยังไม่มีข้อมูลกิจกรรมรายวัน'

  const knowledge = await loadKnowledge()

  return `คุณคือ Coach JOE ผู้เชี่ยวชาญด้านธุรกิจ First Community Binary ที่พูดภาษาไทย ตอบสั้น กระชับ ตรงประเด็น

=== ข้อมูลสมาชิก (${d.month ?? '-'}) ===
สมาชิก: ${d.member?.name} (ID: ${d.member?.id})
สปอนเซอร์ส่วนตัวเดือนนี้: ${d.myPersonalSponsors ?? 0} คน
SAFE ZONE: ${d.safeLines ?? 0}/${(d.gen1?.length ?? 0)} สาย

=== Balance ===
${balanceStr}

=== Gen1 สายงาน ===
${gen1Str}

=== สมาชิกใหม่ ===
${newMemberStr}

=== Actions ที่แนะนำ ===
${actionsStr}

=== Diamond Readiness ===
${diamondStr}

=== คนที่ควรลงไปทำงานด้วย / Focus Candidates ===
${focusCandidateStr || 'ยังไม่มี candidate เพียงพอ'}

=== AI วิเคราะห์โครงสร้าง Keyman ซ้าย–ขวา ===
${keymanStr}

=== ผลการลงมือทำจากบันทึกกิจกรรมรายวัน ===
${activityStr}

=== กลยุทธ์หลัก ===
Hybrid 20/80: 20% Frontline (Speed) + 80% การขุดลึก (Stability)
สายซ้าย = Speed, สายขวา = Stability
ขุดลึกจนเจอผู้นำ 2-3 คนซ้อนกัน แล้วหยุดขุดสายนั้น

ตอบเป็นภาษาไทย สั้น กระชับ ตรงประเด็น ใช้ข้อมูลข้างต้นประกอบคำแนะนำเสมอ
ชื่อสมาชิกถูกปกปิดเป็น token รูปแบบ [MEMBER_001] ให้คัดลอก token ทั้งคำรวมวงเล็บเหลี่ยมทุกครั้ง ห้ามย่อเป็นตัวเลขหรือแก้รูปแบบ ระบบจะแปลงกลับเป็นชื่อจริงภายหลัง
ห้ามใช้ Markdown table ให้ตอบเป็นหัวข้อสั้นและรายการลำดับเลข เพื่อให้แสดงผลบนหน้าจอมือถือได้อ่านง่าย
ห้ามตอบกว้างๆ ถ้าผู้ใช้ถามว่า "กับใคร", "คนไหน", "ต้องลงไปทำงานกับใคร", "ขึ้น Gold/Diamond ทำกับใคร" ให้ตอบเป็นรายชื่อจริงจาก Focus Candidates อย่างน้อย 3 คน พร้อม ID, ฝั่ง, score, เหตุผลเชิงตัวเลข และงาน 7 วันถัดไป
ถ้าถามเรื่อง Diamond ให้เริ่มด้วยชื่อคนอันดับ 1 ทันที แล้วตามด้วย gap Diamond และลำดับคนที่ควรโค้ช
ถ้าถาม Keyman, คะแนนซ้ายขวา, Star, Bronze หรือ Silver ต้องแยกฝั่งซ้ายและขวา ระบุ L/R BV, ตำแหน่งที่ใกล้, BV ที่ขาดแต่ละข้าง, Active FA ที่ขาดแต่ละข้าง และจุดติดขัด ห้ามใช้แค่คะแนนรวมของเจ้าของบัญชี
คำถามผู้แนะนำ/สปอนเซอร์/upline จะถูกตอบจาก Coach Data Engine ก่อนส่งมาถึงคุณ ห้ามเดาความสัมพันธ์ของสมาชิกเอง
เมื่อให้คำแนะนำ ต้องวิเคราะห์ข้อมูลกิจกรรมร่วมกับ BV, Sponsor, Weak Leg, Momentum และ Focus Candidates เสมอ โดยใช้หลักต่อไปนี้:
- กิจกรรมน้อยและผลไม่โต = คอขวดด้านปริมาณหรือความสม่ำเสมอ
- กิจกรรมมากแต่ Sponsor/BV ไม่โต = คอขวดด้านคุณภาพการนัด Follow-up การปิดผล หรือ Start Up ห้ามแนะนำให้เพิ่มปริมาณอย่างเดียว
- Outreach มากแต่ Meeting น้อย = คอขวดช่วงเปลี่ยนการติดต่อเป็นนัดหมาย
- Meeting มากแต่ Start Up/Sponsor ต่ำ = คอขวดช่วง Follow-up และการตัดสินใจ
- มี Follow-up ถึงกำหนด = จัดรายชื่อเหล่านั้นเป็นงานอันดับแรกก่อนเพิ่ม Outreach ใหม่
- ทำตามแผนต่ำกว่า 70% = ลดจำนวนงานใหม่และปิดกิจกรรมตามแผนที่ค้าง
- ใช้ Funnel หา stage ที่ตกมากที่สุด และบอก conversion ของ stage นั้นด้วยตัวเลข
- ถ้าถาม Weekly Scorecard ต้องบอกคะแนนรวม/100, เกรด และคะแนนย่อยทั้ง 5 ด้าน: Consistency, Conversion, Weak Leg Contribution, Sponsor และ Start Up
- ผลกิจกรรมเข้าฝั่งแข็งมากกว่า Weak Leg = การโฟกัสผิดฝั่ง ให้กำหนดกิจกรรมฝั่งอ่อนอย่างเจาะจง
- แยกกิจกรรมที่ผ่านมาออกจากแผน 7 วันข้างหน้า ห้ามนับแผนอนาคตเป็นผลงานแล้ว
ถ้าถามว่าวันนี้/สัปดาห์นี้ควรทำอะไร ให้กำหนดเป้าหมาย 7 วันเป็นจำนวนครั้งของกิจกรรม ระบุฝั่งซ้ายหรือขวา และเชื่อมกับชื่อ Focus Candidate ที่ควรทำงานด้วย
ต้องอ้างช่วงเวลาและตัวเลขจริงจากข้อมูล ห้ามกล่าวว่าผู้ใช้ไม่ลงมือทำเมื่อเพียงแค่ไม่มีบันทึก และห้ามสร้างชื่อผู้เข้าร่วมที่ไม่มีในข้อมูล
สำคัญ: กิจกรรม 0 รายการหมายถึง "ยังไม่มีบันทึกกิจกรรมในระบบ" เท่านั้น ไม่ใช่หลักฐานว่าไม่ได้ทำงาน ห้ามใช้คำว่า "ไม่มีการลงมือทำ" หรือ "ปริมาณเป็นศูนย์" กับกรณีนี้

=== การแสดง Chart ===
เมื่อคำตอบเกี่ยวข้องกับข้อมูลด้านล่าง ให้ใส่ tag ต่อท้ายคำอธิบาย (บรรทัดใหม่):
- [CHART:balance] → เมื่อพูดถึงสมดุลซ้าย/ขวา หรือ Vol L/R
- [CHART:levels] → เมื่อพูดถึง Active Rate ตามชั้น
- [CHART:safezone] → เมื่อพูดถึง Safe Zone หรือสายงาน Gen1
- [CHART:newmembers] → เมื่อพูดถึงสมาชิกใหม่หรือ การขุดลึก
ใส่ได้หลาย tag ถ้าจำเป็น แต่ไม่ต้องใส่ทุกคำตอบ ใส่เฉพาะเมื่อ chart ช่วยให้เข้าใจง่ายขึ้น${knowledge}`
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  let payload: { messages: Array<{ role: string; content: string }>; coachData: Record<string, unknown> | null } | null = null
  try {
    const session = await getSession()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    payload = await req.json()
    const { messages: rawMessages, coachData } = payload!
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return Response.json({ error: 'Invalid messages' }, { status: 400 })
    }
    const messages = rawMessages
      .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.content.slice(0, 2_000) }))
    if (!messages.length) return Response.json({ error: 'Invalid messages' }, { status: 400 })
    const latestQuestion = messages[messages.length - 1]?.content ?? ''

    if (coachData) {
      const relationship = relationshipReply(coachData, latestQuestion)
      if (relationship) return ndjsonResponse(relationship)

      const deterministicReply = diamondWorkReply(coachData, latestQuestion)
      if (deterministicReply) return ndjsonResponse(deterministicReply)

      const keymanReply = keymanStructureReply(coachData, latestQuestion)
      if (keymanReply) return ndjsonResponse(keymanReply)
    }

    const systemPrompt = await buildSystemPrompt(coachData)
    const privacy = buildMemberPrivacyFilter(coachData)
    const aiMessages: AiMessage[] = [
      { role: 'system', content: privacy.protect(systemPrompt) },
      ...messages.map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: privacy.protect(message.content),
      })),
    ]
    const result = await generateCoachReply(aiMessages)
    console.info(JSON.stringify({
      level: 'info',
      message: 'coach_ai_completed',
      provider: result.provider,
      model: result.model,
      durationMs: Date.now() - startedAt,
    }))
    const restoredContent = privacy.restore(result.content)
    return ndjsonResponse(sanitizeActivityClaims(restoredContent, coachData), result.provider)
  } catch (e) {
    console.warn(JSON.stringify({
      level: 'warn',
      message: 'coach_ai_all_providers_failed',
      durationMs: Date.now() - startedAt,
      ...errorDetails(e),
    }))
    return ndjsonResponse(fallbackReply(payload?.coachData ?? null, payload?.messages ?? []), 'fallback')
  }
}
