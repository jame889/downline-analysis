'use client'
import { useEffect, useState } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell
} from 'recharts'
import PositionBadge from '@/components/PositionBadge'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Gen1 {
  id: string; name: string; position: string
  is_active: boolean; monthly_bv: number
  vol_left: number; vol_right: number
  depth: number; sub_count: number; active_in_sub: number
  is_safe_zone: boolean
}

interface NewMember {
  id: string; name: string; upline_id: string | null
  join_date: string; level: number; depth: number; is_tapped: boolean
}

interface Action {
  priority: 'high' | 'medium' | 'low'
  category: string; title: string; detail: string
}

interface CoachData {
  month: string
  member: { id: string; name: string }
  balance: {
    L: number; R: number; total: number
    weakSide: 'L' | 'R'; weakVol: number; strongVol: number
    weakPct: number; gapToBalance: number
    urgency: 'critical' | 'warning' | 'good'
  }
  gen1: Gen1[]
  safeLines: number; unsafeLines: number
  newMembers: NewMember[]; untappedNew: NewMember[]
  byLevel: Record<string, { total: number; active: number }>
  actions: Action[]
  myPersonalSponsors: number
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ActionCard({ action }: { action: Action }) {
  const colors = {
    high:   { border: 'border-red-700/60',    bg: 'bg-red-900/20',    dot: 'bg-red-500',    label: 'text-red-400',    badge: 'text-red-300' },
    medium: { border: 'border-amber-700/60',  bg: 'bg-amber-900/20',  dot: 'bg-amber-500',  label: 'text-amber-400',  badge: 'text-amber-300' },
    low:    { border: 'border-slate-700/60',  bg: 'bg-slate-800/40',  dot: 'bg-slate-500',  label: 'text-slate-400',  badge: 'text-slate-400' },
  }
  const c = colors[action.priority]
  return (
    <div className={`border ${c.border} ${c.bg} rounded-xl p-4`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-mono ${c.badge} bg-slate-800 px-1.5 py-0.5 rounded`}>{action.category}</span>
            <span className={`text-xs font-medium ${c.label}`}>
              {action.priority === 'high' ? 'เร่งด่วน' : action.priority === 'medium' ? 'สำคัญ' : 'แนะนำ'}
            </span>
          </div>
          <p className="text-sm font-semibold text-white">{action.title}</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{action.detail}</p>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CoachPage() {
  const [data, setData] = useState<CoachData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/coach')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
  }, [])

  if (loading) return <div className="text-slate-400 py-16 text-center">กำลังวิเคราะห์...</div>
  if (!data || 'error' in data) return <div className="text-slate-400 py-16 text-center">ไม่พบข้อมูล</div>

  const { balance, gen1, actions, newMembers, byLevel, safeLines, unsafeLines } = data

  // Active-by-level chart data
  const levelData = Object.entries(byLevel)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([lv, { total, active }]) => ({
      level: `L${lv}`,
      total,
      active,
      inactive: total - active,
      activePct: total > 0 ? Math.round((active / total) * 100) : 0,
    }))

  const urgencyColor = {
    critical: 'text-red-400',
    warning:  'text-amber-400',
    good:     'text-green-400',
  }[balance.urgency]

  const urgencyBg = {
    critical: 'bg-red-900/20 border-red-700/50',
    warning:  'bg-amber-900/20 border-amber-700/50',
    good:     'bg-green-900/20 border-green-700/50',
  }[balance.urgency]

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">คำแนะนำจาก Coach JOE</h1>
          <p className="text-slate-400 text-sm mt-1">
            วิเคราะห์จาก Binary Growth Architecture · ข้อมูล {data.month}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>Hybrid Strategy 20/80</p>
          <p className="text-slate-600">Speed + Stability</p>
        </div>
      </div>

      {/* ── Action items ── */}
      {actions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <span className="w-1.5 h-4 bg-brand-500 rounded-full" />
            สิ่งที่ต้องทำตอนนี้
          </h2>
          {actions.map((a, i) => <ActionCard key={i} action={a} />)}
        </div>
      )}

      {/* ── L/R Balance ── */}
      <div className={`border ${urgencyBg} rounded-xl p-5`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-300">สมดุลซ้าย/ขวา (Binary Balance)</h2>
          <span className={`text-xs font-bold ${urgencyColor}`}>
            {balance.urgency === 'critical' ? '⚠ วิกฤต' : balance.urgency === 'warning' ? '⚡ ต้องระวัง' : '✓ ดี'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4 text-center">
          <div>
            <p className="text-xs text-sky-400 mb-1">Vol ซ้าย</p>
            <p className="text-2xl font-bold text-sky-400">{balance.L.toLocaleString()}</p>
            <p className="text-xs text-slate-500">{balance.total > 0 ? ((balance.L / balance.total) * 100).toFixed(1) : 0}%</p>
          </div>
          <div>
            <p className="text-xs text-amber-400 mb-1">Weak Leg</p>
            <p className={`text-2xl font-bold ${urgencyColor}`}>{balance.weakVol.toLocaleString()}</p>
            <p className="text-xs text-slate-500">สาย{balance.weakSide === 'L' ? 'ซ้าย' : 'ขวา'}</p>
          </div>
          <div>
            <p className="text-xs text-purple-400 mb-1">Vol ขวา</p>
            <p className="text-2xl font-bold text-purple-400">{balance.R.toLocaleString()}</p>
            <p className="text-xs text-slate-500">{balance.total > 0 ? ((balance.R / balance.total) * 100).toFixed(1) : 0}%</p>
          </div>
        </div>

        {/* Balance bar */}
        <div className="flex rounded-full overflow-hidden h-6 mb-2">
          <div
            className="bg-sky-500 flex items-center justify-center text-xs text-white font-medium"
            style={{ width: `${balance.total > 0 ? (balance.L / balance.total) * 100 : 50}%` }}
          >
            {balance.total > 0 && ((balance.L / balance.total) * 100) > 8
              ? `${((balance.L / balance.total) * 100).toFixed(0)}%` : ''}
          </div>
          <div className="flex-1 bg-purple-500 flex items-center justify-center text-xs text-white font-medium">
            {balance.total > 0 && ((balance.R / balance.total) * 100) > 8
              ? `${((balance.R / balance.total) * 100).toFixed(0)}%` : ''}
          </div>
        </div>

        {balance.gapToBalance > 0 && (
          <p className="text-xs text-center text-slate-400 mt-2">
            ต้องเพิ่มสาย<span className={urgencyColor}>{balance.weakSide === 'L' ? 'ซ้าย' : 'ขวา'}</span>
            อีก <span className="text-white font-bold">{balance.gapToBalance.toLocaleString()}</span> BV จึงจะ Balance
          </p>
        )}

        {/* Theory box */}
        <div className="mt-4 bg-slate-900/60 rounded-lg p-3 text-xs text-slate-400 border border-slate-800">
          <p className="font-semibold text-slate-300 mb-1">📖 หลักการ: ซ้าย = Speed, ขวา = Stability</p>
          <p>สาย<strong className="text-sky-400">ซ้าย</strong> — มุ่งเปิดสปอนเซอร์ส่วนตัว สร้างผลลัพธ์รายได้เร็ว</p>
          <p>สาย<strong className="text-purple-400">ขวา</strong> — ช่วยคนทำให้คนมา ขุดลึก Duplication และความมั่นคงระยะยาว</p>
        </div>
      </div>

      {/* ── SAFE ZONE status ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-1">SAFE ZONE Status (ขุดลึก ≥ 3 ชั้น)</h2>
        <p className="text-xs text-slate-500 mb-4">เมื่อสายงานลึกถึง Level 3-4 ระบบเริ่ม "มั่นคง" ย้ายโฟกัสไปสายอื่นได้</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {gen1.map((g) => (
            <div
              key={g.id}
              className={`rounded-xl p-3 border text-xs
                ${g.is_safe_zone
                  ? 'border-green-700/50 bg-green-900/20'
                  : 'border-slate-700 bg-slate-800/40'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <Link href={`/members/${g.id}`} className="text-brand-400 font-mono hover:underline">{g.id}</Link>
                <span className={g.is_safe_zone ? 'text-green-400 font-bold' : 'text-slate-500'}>
                  {g.is_safe_zone ? '✓ SAFE' : '○'}
                </span>
              </div>
              <p className="text-slate-300 truncate mb-2">{g.name.split(' ')[0]}</p>
              <div className="grid grid-cols-2 gap-1 text-slate-400">
                <span>ลึก: <span className={g.depth >= 3 ? 'text-green-400' : 'text-amber-400'}>{g.depth} ชั้น</span></span>
                <span>ทีม: <span className="text-white">{g.sub_count}</span></span>
                <span>Active: <span className="text-green-400">{g.active_in_sub}</span></span>
                <span className={g.is_active ? 'text-green-400' : 'text-red-400'}>
                  {g.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-green-400 font-bold">{safeLines} สาย</span>
            <span className="text-slate-400">SAFE ZONE</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-slate-600" />
            <span className="text-slate-300 font-bold">{unsafeLines} สาย</span>
            <span className="text-slate-400">ยังต้องขุดต่อ</span>
          </div>
        </div>
        <div className="mt-3 bg-slate-900/60 rounded-lg p-3 text-xs text-slate-400 border border-slate-800">
          <p className="font-semibold text-slate-300 mb-1">📖 หลักการ: When to Stop Digging</p>
          <p>ขุดลึกจนเจอ "ผู้นำที่ทำงานแทนคุณได้" ต้องมีผู้นำตัวจริงอย่างน้อย 2-3 คนซ้อนกันในสายนั้น</p>
        </div>
      </div>

      {/* ── New members / 48hr Taproot ── */}
      {newMembers.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-1">
            สมาชิกใหม่เดือนนี้ ({newMembers.length} คน) — Taproot ภายใน 48 ชั่วโมง
          </h2>
          <p className="text-xs text-slate-500 mb-4">ทำ Work Plan ทันทีหลังสปอนเซอร์ได้ — ขุดลึกคนแรกให้เป็น "ความลึก" ทันที</p>
          <div className="space-y-2">
            {newMembers.map((m) => (
              <div key={m.id} className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs
                ${m.is_tapped ? 'bg-green-900/20 border border-green-800/40' : 'bg-amber-900/20 border border-amber-700/40'}`}
              >
                <div className="flex items-center gap-3">
                  <span className={m.is_tapped ? 'text-green-400' : 'text-amber-400'}>
                    {m.is_tapped ? '✓' : '⏳'}
                  </span>
                  <Link href={`/members/${m.id}`} className="text-brand-400 font-mono hover:underline">{m.id}</Link>
                  <span className="text-slate-300">{m.name}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-400">
                  <span>Level {m.level}</span>
                  <span className={m.is_tapped ? 'text-green-400' : 'text-amber-400'}>
                    {m.is_tapped ? `Taprooted (${m.depth} ชั้น)` : 'ยังไม่ได้ Taproot'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 bg-slate-900/60 rounded-lg p-3 text-xs text-slate-400 border border-slate-800">
            <p className="font-semibold text-slate-300 mb-1">📖 Hybrid Step 2: The Taproot</p>
            <p>รีบทำ "Work Plan" เพื่อดึงรายชื่อผู้มุ่งหวังออกจากมือเขา และส่งไปช่วยเขาสปอนเซอร์ "คนแรก" ให้ภายใน 48-72 ชั่วโมง</p>
          </div>
        </div>
      )}

      {/* ── Active rate by level ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-1">Active Rate ตามชั้น</h2>
        <p className="text-xs text-slate-500 mb-4">ชั้นที่ Active น้อยคือจุดที่ต้อง "ปลุกคนหลับ" (Waking the Upline)</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={levelData} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="level" tick={{ fill: '#64748b', fontSize: 11 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
              formatter={(v: number, name: string) => [v, name === 'active' ? 'Active' : 'Inactive']}
            />
            <Bar dataKey="active" name="Active" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
            <Bar dataKey="inactive" name="Inactive" stackId="a" fill="#334155" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-3 mt-3">
          {levelData.map((d) => (
            <div key={d.level} className="text-center">
              <p className="text-xs text-slate-400">{d.level}</p>
              <p className={`text-sm font-bold ${d.activePct >= 50 ? 'text-green-400' : d.activePct >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                {d.activePct}%
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Hybrid 20/80 Framework ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Hybrid Strategy 20/80 — สูตรสมบูรณ์แบบ</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-orange-900/20 border border-orange-700/40 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-orange-400 font-bold text-lg">20%</span>
              <span className="text-sm font-semibold text-orange-300">Frontline (Speed)</span>
            </div>
            <ul className="text-xs text-slate-300 space-y-1.5">
              <li className="flex gap-2"><span className="text-orange-400">•</span>สร้างโมเมนตัม รักษาสถานะผู้นำ</li>
              <li className="flex gap-2"><span className="text-orange-400">•</span>Lead by Example ให้ทีมเห็น</li>
              <li className="flex gap-2"><span className="text-orange-400">•</span>หาวัตถุดิบใหม่เข้าองค์กร</li>
            </ul>
            <div className="mt-3 pt-3 border-t border-orange-800/40">
              <p className="text-xs text-slate-400">เดือนนี้: สปอนเซอร์ส่วนตัว</p>
              <p className={`text-xl font-bold mt-0.5 ${data.myPersonalSponsors > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {data.myPersonalSponsors} คน
              </p>
              <p className="text-xs text-slate-500">{data.myPersonalSponsors > 0 ? '✓ ดีแล้ว' : 'ยังไม่ได้สปอนเซอร์เลย'}</p>
            </div>
          </div>

          <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-blue-400 font-bold text-lg">80%</span>
              <span className="text-sm font-semibold text-blue-300">Taprooting (Stability)</span>
            </div>
            <ul className="text-xs text-slate-300 space-y-1.5">
              <li className="flex gap-2"><span className="text-blue-400">•</span>ขุดลึกในสาย Weak Leg ทันที</li>
              <li className="flex gap-2"><span className="text-blue-400">•</span>Work Plan กับสมาชิกใหม่ 48hr</li>
              <li className="flex gap-2"><span className="text-blue-400">•</span>ปลุกผู้นำในชั้นลึกให้ active</li>
            </ul>
            <div className="mt-3 pt-3 border-t border-blue-800/40">
              <p className="text-xs text-slate-400">SAFE ZONE แล้ว</p>
              <p className="text-xl font-bold mt-0.5 text-blue-400">{safeLines}/{gen1.length} สาย</p>
              <p className="text-xs text-slate-500">{unsafeLines > 0 ? `ต้องขุดต่ออีก ${unsafeLines} สาย` : '✓ ทุกสายมั่นคงแล้ว'}</p>
            </div>
          </div>
        </div>

        {/* 3 Steps summary */}
        <div className="mt-4 grid md:grid-cols-3 gap-3">
          {[
            { step: 1, title: 'The Spark', icon: '⚡', desc: 'สปอนเซอร์ส่วนตัว Lead by Example ป้องกันทีมภาวะน้ำนิ่ง', color: 'border-orange-700/40 bg-orange-900/10' },
            { step: 2, title: 'The Taproot', icon: '🌱', desc: 'Work Plan ภายใน 48 ชม. เปลี่ยนคนใหม่ 1 คนให้เป็นความลึกทันที', color: 'border-green-700/40 bg-green-900/10' },
            { step: 3, title: 'Stop Digging', icon: '🛑', desc: 'หยุดขุดเมื่อถึง Level 3-4 มีผู้นำตัวจริง 2-3 คนซ้อนในสายแล้ว', color: 'border-blue-700/40 bg-blue-900/10' },
          ].map((s) => (
            <div key={s.step} className={`rounded-xl p-3 border ${s.color}`}>
              <p className="text-xs text-slate-400 mb-1">Step {s.step}</p>
              <p className="text-sm font-semibold text-white mb-1">{s.icon} {s.title}</p>
              <p className="text-xs text-slate-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
