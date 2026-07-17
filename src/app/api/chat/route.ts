import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'
import { generateCoachReply, getCoachAiHealth, type AiMessage } from '@/lib/coach-ai'
import { getSession } from '@/lib/auth'

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
    actions?: Array<{ priority: string; title: string; detail: string }>
    safeLines?: number
    gen1?: unknown[]
    myPersonalSponsors?: number
  } | null
  const latestQuestion = messages[messages.length - 1]?.content ?? ''
  if (!d) return `Coach JOE กำลังใช้โหมดข้อมูลสำรองครับ\n\nคำถามของคุณ: ${latestQuestion}\n\nแนะนำให้ดู Balance, Weak Leg และ Action Priority ในหน้า Coach ก่อน แล้วลองส่งคำถามอีกครั้งภายหลัง`

  const weakSide = d.balance?.weakSide === 'L' ? 'ซ้าย' : d.balance?.weakSide === 'R' ? 'ขวา' : 'ที่อ่อนกว่า'
  const firstAction = d.actions?.[0]
  return [
    'Cloud AI ยังไม่ตอบในรอบนี้ ผมจึงสรุปจาก Coach Data Engine ให้ทันที:',
    `1. Weak Leg คือสาย${weakSide} ขาดอีกประมาณ ${(d.balance?.gapToBalance ?? 0).toLocaleString()} BV เพื่อ Balance`,
    `2. Safe Zone ตอนนี้ ${d.safeLines ?? 0}/${d.gen1?.length ?? 0} สาย`,
    `3. สปอนเซอร์ส่วนตัวเดือนนี้ ${d.myPersonalSponsors ?? 0} คน`,
    firstAction ? `4. Priority แรก: ${firstAction.title} - ${firstAction.detail}` : '4. Priority แรก: ตรวจสายอ่อนและเลือกคนที่ต้องโค้ชใน 7 วัน',
    '',
    'ให้โฟกัส 7 วันแรกที่ Weak Leg, ปลุก Gen 1 ที่ inactive, และ Start Up สมาชิกใหม่ให้เร็วที่สุด [CHART:balance]',
  ].join('\n')
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
      output = output.split(item.token).join(`${item.name} (${item.id})`)
    }
    return output
  }

  return { protect, restore }
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

=== กลยุทธ์หลัก ===
Hybrid 20/80: 20% Frontline (Speed) + 80% การขุดลึก (Stability)
สายซ้าย = Speed, สายขวา = Stability
ขุดลึกจนเจอผู้นำ 2-3 คนซ้อนกัน แล้วหยุดขุดสายนั้น

ตอบเป็นภาษาไทย สั้น กระชับ ตรงประเด็น ใช้ข้อมูลข้างต้นประกอบคำแนะนำเสมอ
ห้ามตอบกว้างๆ ถ้าผู้ใช้ถามว่า "กับใคร", "คนไหน", "ต้องลงไปทำงานกับใคร", "ขึ้น Gold/Diamond ทำกับใคร" ให้ตอบเป็นรายชื่อจริงจาก Focus Candidates อย่างน้อย 3 คน พร้อม ID, ฝั่ง, score, เหตุผลเชิงตัวเลข และงาน 7 วันถัดไป
ถ้าถามเรื่อง Diamond ให้เริ่มด้วยชื่อคนอันดับ 1 ทันที แล้วตามด้วย gap Diamond และลำดับคนที่ควรโค้ช
คำถามผู้แนะนำ/สปอนเซอร์/upline จะถูกตอบจาก Coach Data Engine ก่อนส่งมาถึงคุณ ห้ามเดาความสัมพันธ์ของสมาชิกเอง

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
    return ndjsonResponse(privacy.restore(result.content), result.provider)
  } catch (e) {
    console.warn(JSON.stringify({
      level: 'warn',
      message: 'coach_ai_all_providers_failed',
      durationMs: Date.now() - startedAt,
      ...errorDetails(e),
    }))
    return ndjsonResponse(fallbackReply(payload?.coachData ?? null, payload?.messages ?? []))
  }
}
