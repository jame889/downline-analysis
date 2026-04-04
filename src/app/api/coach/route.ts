import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAvailableMonths } from '@/lib/db'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const DATA_DIR = path.join(process.cwd(), 'data')

function loadMembers() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'members.json'), 'utf-8')) as Record<string, {
    id: string; name: string; join_date: string; upline_id: string | null; sponsor_id: string | null; lv: number
  }>
}

function loadReport(month: string) {
  const f = path.join(DATA_DIR, 'reports', `${month}.json`)
  if (!fs.existsSync(f)) return []
  return JSON.parse(fs.readFileSync(f, 'utf-8')) as Array<{
    member_id: string; month: string; level: number;
    highest_position: string; monthly_bv: number;
    is_active: boolean; is_qualified: boolean;
    total_vol_left: number; total_vol_right: number;
    current_month_vol_left: number; current_month_vol_right: number;
  }>
}

// Build children map from members
function buildChildrenMap(members: ReturnType<typeof loadMembers>) {
  const children: Record<string, string[]> = {}
  for (const m of Object.values(members)) {
    if (m.upline_id) {
      if (!children[m.upline_id]) children[m.upline_id] = []
      children[m.upline_id].push(m.id)
    }
  }
  return children
}

// BFS subtree → { id: depth }
function getSubtreeMap(start: string, children: Record<string, string[]>): Map<string, number> {
  const map = new Map<string, number>()
  const queue: [string, number][] = [[start, 0]]
  while (queue.length) {
    const [id, d] = queue.shift()!
    map.set(id, d)
    for (const c of children[id] ?? []) queue.push([c, d + 1])
  }
  return map
}

// ── Score helpers ─────────────────────────────────────────────────────────────

function balanceScore(l: number, r: number) {
  const total = l + r
  if (total === 0) return { score: 0, pct: 50 }
  const weakPct = (Math.min(l, r) / total) * 100
  return { score: Math.round(weakPct * 2), pct: Math.round(weakPct) } // 0-100
}

function getUrgency(weakPct: number): 'critical' | 'warning' | 'good' {
  if (weakPct < 20) return 'critical'
  if (weakPct < 35) return 'warning'
  return 'good'
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const months = await getAvailableMonths()
  const latestMonth = months[0]
  const prevMonth = months[1]

  const members = loadMembers()
  const repMap = new Map(loadReport(latestMonth).map((r) => [r.member_id, r]))
  const prevRepMap = new Map(loadReport(prevMonth).map((r) => [r.member_id, r]))
  const children = buildChildrenMap(members)

  const rootId = session.memberId
  const myRep = repMap.get(rootId)
  if (!myRep) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })

  // ── 1. L/R Balance ───────────────────────────────────────────────────────────
  const L = myRep.total_vol_left
  const R = myRep.total_vol_right
  const total = L + R
  const weakSide = L <= R ? 'L' : 'R'
  const weakVol = Math.min(L, R)
  const strongVol = Math.max(L, R)
  const { pct: weakPct } = balanceScore(L, R)
  const urgency = getUrgency(weakPct)
  const gapToBalance = Math.max(0, strongVol - weakVol)

  // ── 2. Gen 1 analysis ────────────────────────────────────────────────────────
  const gen1 = children[rootId] ?? []
  const gen1Detail = gen1.map((mid) => {
    const sub = getSubtreeMap(mid, children)
    const maxDepth = sub.size > 1 ? Math.max(...Array.from(sub.values())) : 0
    const subCount = sub.size - 1
    const activeInSub = Array.from(sub.keys()).filter((id) => id !== mid && repMap.get(id)?.is_active).length
    const rep = repMap.get(mid)
    const m = members[mid]
    const isSafe = maxDepth >= 3 // SAFE ZONE = depth 3+
    return {
      id: mid,
      name: m?.name ?? mid,
      position: rep?.highest_position ?? 'FA',
      is_active: rep?.is_active ?? false,
      monthly_bv: rep?.monthly_bv ?? 0,
      vol_left: rep?.total_vol_left ?? 0,
      vol_right: rep?.total_vol_right ?? 0,
      depth: maxDepth,
      sub_count: subCount,
      active_in_sub: activeInSub,
      is_safe_zone: isSafe,
    }
  })

  // ── 3. SAFE ZONE summary ─────────────────────────────────────────────────────
  const safeLines = gen1Detail.filter((g) => g.is_safe_zone).length
  const unsafeLines = gen1Detail.filter((g) => !g.is_safe_zone).length

  // ── 4. New members this month (need 48hr การขุดลึก) ─────────────────────────
  const prevIds = new Set(prevRepMap.keys())
  const newMembers = Array.from(repMap.values())
    .filter((r) => !prevIds.has(r.member_id))
    .map((r) => {
      const m = members[r.member_id]
      const sub = getSubtreeMap(r.member_id, children)
      return {
        id: r.member_id,
        name: m?.name ?? r.member_id,
        upline_id: m?.upline_id,
        join_date: m?.join_date,
        level: r.level,
        depth: sub.size > 1 ? Math.max(...Array.from(sub.values())) : 0,
        is_tapped: sub.size > 1, // Has been การขุดลึกed if they have downlines
      }
    })
    .filter((r) => {
      // Only show new members within root's subtree
      const rootSub = getSubtreeMap(rootId, children)
      return rootSub.has(r.id)
    })

  // ── 5. Active rate by level (first 8 levels) ─────────────────────────────────
  const rootSub = getSubtreeMap(rootId, children)
  const byLevel: Record<number, { total: number; active: number }> = {}
  for (const [id, depth] of Array.from(rootSub)) {
    if (id === rootId) continue
    if (!byLevel[depth]) byLevel[depth] = { total: 0, active: 0 }
    byLevel[depth].total++
    if (repMap.get(id)?.is_active) byLevel[depth].active++
  }

  // ── 6. Hybrid 20/80 recommendation ──────────────────────────────────────────
  // Frontline: how many new personal sponsors this month
  const myPersonalSponsors = newMembers.filter((m) => m.upline_id === rootId)

  // Score: how close to 20/80 hybrid
  const frontlineScore = Math.min(100, (myPersonalSponsors.length / 1) * 100) // target: 1+ new/month

  // ── 7. Coach action items ────────────────────────────────────────────────────
  const actions: Array<{ priority: 'high' | 'medium' | 'low'; category: string; title: string; detail: string }> = []

  if (urgency === 'critical') {
    actions.push({
      priority: 'high',
      category: 'Balance',
      title: `สาย${weakSide === 'L' ? 'ซ้าย' : 'ขวา'}วิกฤต! ต้องเร่งด่วน`,
      detail: `Vol ${weakSide === 'L' ? 'ซ้าย' : 'ขวา'} คิดเป็นแค่ ${weakPct}% ของทั้งหมด ต้องเพิ่ม ${gapToBalance.toLocaleString()} BV เพื่อ balance ควรเน้น การขุดลึก ในสาย${weakSide === 'L' ? 'ซ้าย' : 'ขวา'}ทันที`,
    })
  }

  const untappedNew = newMembers.filter((m) => !m.is_tapped)
  if (untappedNew.length > 0) {
    actions.push({
      priority: 'high',
      category: 'การขุดลึก 48hr',
      title: `${untappedNew.length} คนใหม่ยังไม่ถูก การขุดลึก!`,
      detail: `ตาม Hybrid Step 2 ต้องทำ Start Up ภายใน 48 ชั่วโมง: ${untappedNew.map((m) => m.name.split(' ')[0]).join(', ')}`,
    })
  }

  const inactiveGen1 = gen1Detail.filter((g) => !g.is_active)
  if (inactiveGen1.length > 0) {
    actions.push({
      priority: 'medium',
      category: 'Waking Upline',
      title: `Gen 1 Inactive ${inactiveGen1.length} คน — ปลุกคนหลับ`,
      detail: `${inactiveGen1.map((g) => g.name.split(' ')[0]).join(', ')} ยังไม่ Active การปลุกคนในชั้นลึกต้องเริ่มจากการกระตุ้นคนบนต้น`,
    })
  }

  if (unsafeLines > 0) {
    actions.push({
      priority: 'medium',
      category: 'SAFE ZONE',
      title: `${unsafeLines} สาย ยังไม่ถึง SAFE ZONE (depth < 3)`,
      detail: `ขุดลึกให้ถึง Level 3-4 ก่อนโยกโฟกัสไปสายอื่น ปัจจุบัน ${safeLines} สายอยู่ใน SAFE ZONE แล้ว`,
    })
  }

  if (myPersonalSponsors.length === 0) {
    actions.push({
      priority: 'low',
      category: 'Frontline (20%)',
      title: 'ยังไม่ได้สปอนเซอร์ส่วนตัวเดือนนี้',
      detail: 'ตาม Hybrid Step 1 ต้องสปอนเซอร์ส่วนตัวเพื่อ Lead by Example และป้องกันทีมภาวะน้ำนิ่ง',
    })
  }

  return NextResponse.json({
    month: latestMonth,
    member: { id: rootId, name: session.name },

    // Balance
    balance: { L, R, total, weakSide, weakVol, strongVol, weakPct, gapToBalance, urgency },

    // Gen 1
    gen1: gen1Detail,
    safeLines,
    unsafeLines,

    // New members
    newMembers,
    untappedNew,

    // Active by level
    byLevel,

    // Actions
    actions,

    // Hybrid score
    myPersonalSponsors: myPersonalSponsors.length,
  })
}
