import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'

const cleanEnv = (value: string | undefined) => value?.replace(/\\n|\n/g, '').replace(/^"|"$/g, '').trim() ?? ''

const OLLAMA_URL = cleanEnv(process.env.OLLAMA_URL) || 'http://localhost:11434'
const MODEL = cleanEnv(process.env.OLLAMA_MODEL) || 'llama3.2:3b'
const OLLAMA_NUM_CTX = Number(cleanEnv(process.env.OLLAMA_NUM_CTX)) || 2048
const OLLAMA_NUM_PREDICT = Number(cleanEnv(process.env.OLLAMA_NUM_PREDICT)) || 350
const OLLAMA_TIMEOUT_MS = Number(cleanEnv(process.env.OLLAMA_TIMEOUT_MS)) || 55_000
const KNOWLEDGE_DIR = path.join(process.cwd(), 'data', 'knowledge')

const SUPABASE_URL = cleanEnv(process.env.SUPABASE_URL)
const SUPABASE_KEY = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
const BUCKET = 'knowledge'
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY)

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
    .map(d => d.content ? `### ${d.title}\n${d.content.slice(0, 3000)}` : null)
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
  if (!d) return `ตอนนี้ระบบ AI หลักเชื่อมต่อไม่ได้ชั่วคราว แต่ Coach JOE ยังรับคำถามได้ครับ\n\nคำถามของคุณ: ${latestQuestion}\n\nแนะนำให้ดู Balance, Weak Leg และ Action Priority ในหน้า Coach ก่อน แล้วลองส่งคำถามอีกครั้งภายหลัง`

  const weakSide = d.balance?.weakSide === 'L' ? 'ซ้าย' : d.balance?.weakSide === 'R' ? 'ขวา' : 'ที่อ่อนกว่า'
  const firstAction = d.actions?.[0]
  return [
    'ตอนนี้ AI หลักเชื่อมต่อไม่ได้ชั่วคราว ผมสรุปจากข้อมูล Dashboard ให้ก่อน:',
    `1. Weak Leg คือสาย${weakSide} ขาดอีกประมาณ ${(d.balance?.gapToBalance ?? 0).toLocaleString()} BV เพื่อ Balance`,
    `2. Safe Zone ตอนนี้ ${d.safeLines ?? 0}/${d.gen1?.length ?? 0} สาย`,
    `3. สปอนเซอร์ส่วนตัวเดือนนี้ ${d.myPersonalSponsors ?? 0} คน`,
    firstAction ? `4. Priority แรก: ${firstAction.title} - ${firstAction.detail}` : '4. Priority แรก: ตรวจสายอ่อนและเลือกคนที่ต้องโค้ชใน 7 วัน',
    '',
    'ให้โฟกัส 7 วันแรกที่ Weak Leg, ปลุก Gen 1 ที่ inactive, และ Start Up สมาชิกใหม่ให้เร็วที่สุด [CHART:balance]',
  ].join('\n')
}

function ndjsonResponse(content: string) {
  return new Response(`${JSON.stringify({ message: { content } })}\n`, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
    },
  })
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

=== กลยุทธ์หลัก ===
Hybrid 20/80: 20% Frontline (Speed) + 80% การขุดลึก (Stability)
สายซ้าย = Speed, สายขวา = Stability
ขุดลึกจนเจอผู้นำ 2-3 คนซ้อนกัน แล้วหยุดขุดสายนั้น

ตอบเป็นภาษาไทย สั้น กระชับ ตรงประเด็น ใช้ข้อมูลข้างต้นประกอบคำแนะนำเสมอ

=== การแสดง Chart ===
เมื่อคำตอบเกี่ยวข้องกับข้อมูลด้านล่าง ให้ใส่ tag ต่อท้ายคำอธิบาย (บรรทัดใหม่):
- [CHART:balance] → เมื่อพูดถึงสมดุลซ้าย/ขวา หรือ Vol L/R
- [CHART:levels] → เมื่อพูดถึง Active Rate ตามชั้น
- [CHART:safezone] → เมื่อพูดถึง Safe Zone หรือสายงาน Gen1
- [CHART:newmembers] → เมื่อพูดถึงสมาชิกใหม่หรือ การขุดลึก
ใส่ได้หลาย tag ถ้าจำเป็น แต่ไม่ต้องใส่ทุกคำตอบ ใส่เฉพาะเมื่อ chart ช่วยให้เข้าใจง่ายขึ้น${knowledge}`
}

export async function POST(req: NextRequest) {
  let payload: { messages: Array<{ role: string; content: string }>; coachData: Record<string, unknown> | null } | null = null
  try {
    payload = await req.json()
    const { messages, coachData } = payload!

    const systemPrompt = await buildSystemPrompt(coachData)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS)

    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        stream: true,
        options: {
          num_ctx: OLLAMA_NUM_CTX,
          num_predict: OLLAMA_NUM_PREDICT,
          temperature: 0.4,
        },
      }),
    })
    clearTimeout(timeout)

    if (!ollamaRes.ok) {
      return ndjsonResponse(fallbackReply(coachData, messages))
    }

    // Forward Ollama's NDJSON stream as-is
    return new Response(ollamaRes.body, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (e) {
    console.warn('[chat] fallback response', e)
    return ndjsonResponse(fallbackReply(payload?.coachData ?? null, payload?.messages ?? []))
  }
}
