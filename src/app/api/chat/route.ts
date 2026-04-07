import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL || 'gemma4:e2b'
const KNOWLEDGE_DIR = path.join(process.cwd(), 'data', 'knowledge')

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\n/g, '') ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\n/g, '') ?? ''
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
  } else {
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
  try {
    const { messages, coachData } = await req.json()

    const systemPrompt = await buildSystemPrompt(coachData)

    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    })

    if (!ollamaRes.ok) {
      return Response.json({ error: 'Ollama error' }, { status: 500 })
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
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
