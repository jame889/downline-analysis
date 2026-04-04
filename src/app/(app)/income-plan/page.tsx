'use client'
import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, ReferenceLine, Cell,
} from 'recharts'

// ── Types ────────────────────────────────────────────────────────────────────
interface CoachAction {
  priority: 'high' | 'medium' | 'low'
  title: string
  detail: string
  impact: string
}

interface Milestone {
  rank: string; rankTH: string; minorBV: number; activeFA: number
  monthlyIncome: number; oneTimeBonus: number; monthsFromNow: number
  teamComm: number; matching: number; matrixBonus: number
}

interface RankPotential {
  rank: string; rankTH: string; minorBVRequired: number; activeFARequired: number
  teamComm: number; matching: number; referral: number; total: number
  oneTimeBonus: number; matchingCap: number
  matrixBonus: number; matrixFull: number; matrixDepth: number; matrixRequiredActive: number
}

interface MatrixLevel {
  rank: string; rankTH: string; matrixDepth: number; requiredActive: number; potentialBonus: number
}

interface IncomePlanData {
  goal: number
  month: string
  member: { id: string; name: string }
  current: {
    position: string; minorVolCumulative: number; majorVolCumulative: number
    currMinorMonthly: number; currMonthL: number; currMonthR: number
    leftActiveFA: number; rightActiveFA: number; totalActiveFA: number
    estimatedMonthlyIncome: number; teamComm: number; matching: number; referral: number
    matrixBonus: number; newMembersThisMonth: number
  }
  matrixLevels: MatrixLevel[]
  plan: {
    targetMonthly: number; total: number; breakdown: { source: string; amount: number; pct: number }[]
    recommendedRank: { rank: string; rankTH: string; minorBVRequired: number; activeFARequired: number; oneTimeBonus: number }
    teamCommission: number; matchingBonus: number; referralBonus: number
    months_to_target: number
  }
  gap: { gapMinorBV: number; gapActiveFA: number; gapIncome: number; incomeProgressPct: number }
  milestones: Milestone[]
  coachActions: CoachAction[]
  allRankPotentials: RankPotential[]
  rankProgress: {
    current: { rank: string; rankTH: string }
    next: { rank: string; rankTH: string; minorBVRequired: number; activeFARequired: number }
    volPct: number; faPct: number
  }
}

// ── Goal tiers ────────────────────────────────────────────────────────────────
const GOALS = [
  { value: 50_000,    label: '฿50,000', sublabel: 'ระยะสั้น', desc: 'เริ่มมีรายได้เสริมชัดเจน', color: 'from-green-600 to-emerald-700', icon: '🌱', border: 'border-green-600' },
  { value: 500_000,   label: '฿500,000', sublabel: 'ระยะกลาง', desc: 'รายได้หลักแทนเงินเดือน', color: 'from-blue-600 to-indigo-700', icon: '🚀', border: 'border-blue-500' },
  { value: 5_000_000, label: '฿5,000,000', sublabel: 'ระยะยาว', desc: 'อิสรภาพทางการเงิน', color: 'from-amber-500 to-orange-600', icon: '👑', border: 'border-amber-500' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString() }
function fmtThb(n: number) { return `฿${n.toLocaleString()}` }

function PriorityDot({ p }: { p: 'high' | 'medium' | 'low' }) {
  const cls = { high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-slate-500' }[p]
  return <span className={`inline-block w-2 h-2 rounded-full ${cls} shrink-0 mt-1.5`} />
}

function ProgressBar({ pct, color = 'bg-brand-500' }: { pct: number; color?: string }) {
  return (
    <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

// ── Circular progress ────────────────────────────────────────────────────────
function CircleProgress({ pct, label, value, color = '#22d3ee' }: {
  pct: number; label: string; value: string; color?: string
}) {
  const r = 36
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(pct, 100) / 100)
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
          <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-white">{Math.min(pct, 100)}%</span>
        </div>
      </div>
      <p className="text-xs text-slate-400 text-center">{label}</p>
      <p className="text-xs font-semibold text-white text-center">{value}</p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function IncomePlanPage() {
  const [goal, setGoal] = useState(50_000)
  const [data, setData] = useState<IncomePlanData | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'plan' | 'roadmap' | 'calculator' | 'matrix' | 'coach'>('plan')

  useEffect(() => {
    setLoading(true)
    setData(null)
    fetch(`/api/income-plan?goal=${goal}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [goal])

  const selectedGoal = GOALS.find((g) => g.value === goal) ?? GOALS[0]

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-white">วางแผนสร้างรายได้</h1>
        <p className="text-slate-400 text-sm mt-1">เลือกเป้าหมาย แล้วดูคำแนะนำจาก Coach JOE ว่าต้องทำอะไรบ้าง</p>
      </div>

      {/* ── Goal selector ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {GOALS.map((g) => (
          <button
            key={g.value}
            onClick={() => setGoal(g.value)}
            className={`relative rounded-2xl p-5 text-left border-2 transition-all
              ${goal === g.value
                ? `${g.border} bg-gradient-to-br ${g.color} shadow-lg scale-105`
                : 'border-slate-700 bg-slate-900 hover:border-slate-600'}`}
          >
            <div className="text-3xl mb-2">{g.icon}</div>
            <p className="text-xs text-white/70 font-medium">{g.sublabel}</p>
            <p className="text-2xl font-bold text-white">{g.label}</p>
            <p className="text-xs text-white/70 mt-1">{g.desc}</p>
            <p className="text-xs text-white/50 mt-0.5">ต่อเดือน</p>
            {goal === g.value && (
              <span className="absolute top-3 right-3 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                <span className="text-slate-900 text-xs font-bold">✓</span>
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-12 text-slate-400">
          <div className="text-3xl mb-3">🤔</div>
          <p>Coach JOE กำลังวิเคราะห์...</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* ── Current income snapshot ── */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <p className="text-xs text-slate-400">รายได้ที่คาดประมาณเดือนนี้</p>
                <p className="text-3xl font-bold text-white">{fmtThb(data.current.estimatedMonthlyIncome)}</p>
                <p className="text-xs text-slate-500 mt-0.5">ตำแหน่ง: {data.current.position} · {data.month}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">เป้าหมาย</p>
                <p className="text-2xl font-bold text-brand-400">{fmtThb(goal)}</p>
                <p className="text-xs text-slate-500">ต่อเดือน</p>
              </div>
            </div>

            {/* Income progress bar */}
            <div className="mb-2">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>ความคืบหน้าสู่เป้าหมาย</span>
                <span className="text-white font-bold">{data.gap.incomeProgressPct}%</span>
              </div>
              <ProgressBar
                pct={data.gap.incomeProgressPct}
                color={data.gap.incomeProgressPct >= 80 ? 'bg-green-500' : data.gap.incomeProgressPct >= 40 ? 'bg-amber-500' : 'bg-brand-500'}
              />
            </div>
            <p className="text-xs text-slate-500">
              ต้องเพิ่มอีก {fmtThb(data.gap.gapIncome)}/เดือน
            </p>

            {/* Current income breakdown */}
            <div className="grid grid-cols-4 gap-2 mt-4">
              {[
                { label: 'ค่าทีม', value: data.current.teamComm, color: 'text-sky-400', icon: '⚡' },
                { label: 'Matching', value: data.current.matching, color: 'text-purple-400', icon: '🔗' },
                { label: 'Matrix', value: data.current.matrixBonus, color: 'text-emerald-400', icon: '🌐' },
                { label: 'Referral', value: data.current.referral, color: 'text-amber-400', icon: '👥' },
              ].map((item) => (
                <div key={item.label} className="bg-slate-800/50 rounded-xl p-2.5 text-center">
                  <p className="text-base">{item.icon}</p>
                  <p className="text-xs text-slate-400">{item.label}</p>
                  <p className={`text-sm font-bold mt-0.5 ${item.color}`}>{fmtThb(item.value)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-2 flex-wrap">
            {([
              { id: 'plan', label: '📊 แผนรายได้' },
              { id: 'roadmap', label: '🗺️ เส้นทาง' },
              { id: 'calculator', label: '🧮 ตารางรายได้' },
              { id: 'matrix', label: '🌐 Matrix Bonus' },
              { id: 'coach', label: '💬 Coach JOE' },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors
                  ${activeTab === tab.id
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Tab: Plan ── */}
          {activeTab === 'plan' && (
            <div className="space-y-4">
              {/* Target rank */}
              <div className={`rounded-2xl p-5 border-2 ${selectedGoal.border} bg-gradient-to-br ${selectedGoal.color}/10`}>
                <p className="text-xs text-slate-400 mb-1">ตำแหน่งที่แนะนำสำหรับเป้าหมาย {fmtThb(goal)}/เดือน</p>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-3xl font-bold text-white">{data.plan.recommendedRank.rankTH}</p>
                    <p className="text-sm text-slate-300 mt-1">
                      Minor Vol {fmt(data.plan.recommendedRank.minorBVRequired)} BV/เดือน ·
                      Active FA {data.plan.recommendedRank.activeFARequired} คน/สาย
                    </p>
                    <p className="text-xs text-amber-400 mt-0.5">
                      โบนัสขึ้นตำแหน่ง: {fmtThb(data.plan.recommendedRank.oneTimeBonus)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">รายได้รวม/เดือน</p>
                    <p className="text-3xl font-bold text-green-400">{fmtThb(data.plan.total)}</p>
                  </div>
                </div>
              </div>

              {/* Income breakdown */}
              <div className="grid md:grid-cols-3 gap-4">
                {data.plan.breakdown.map((item) => (
                  <div key={item.source} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <p className="text-xs text-slate-400">{item.source}</p>
                    <p className="text-2xl font-bold text-white mt-1">{fmtThb(item.amount)}</p>
                    <ProgressBar pct={item.pct} color="bg-brand-500" />
                    <p className="text-xs text-slate-500 mt-1">{item.pct}% ของรายได้ทั้งหมด</p>
                  </div>
                ))}
              </div>

              {/* Gap circular progress */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">สิ่งที่ต้องพัฒนา</h3>
                <div className="flex flex-wrap justify-around gap-4">
                  <CircleProgress
                    pct={data.gap.incomeProgressPct}
                    label="รายได้ปัจจุบัน"
                    value={fmtThb(data.current.estimatedMonthlyIncome)}
                    color="#22d3ee"
                  />
                  <CircleProgress
                    pct={data.rankProgress.volPct}
                    label={`Minor Vol → ${data.rankProgress.next.rankTH}`}
                    value={`${fmt(data.current.currMinorMonthly)} BV`}
                    color="#a855f7"
                  />
                  <CircleProgress
                    pct={data.rankProgress.faPct}
                    label={`Active FA → ${data.rankProgress.next.rankTH}`}
                    value={`${Math.min(data.current.leftActiveFA, data.current.rightActiveFA)} คน`}
                    color="#f59e0b"
                  />
                  <CircleProgress
                    pct={Math.min(100, Math.round(((data.current.leftActiveFA + data.current.rightActiveFA) / (data.plan.recommendedRank.activeFARequired * 2)) * 100))}
                    label={`Active FA สู่ ${data.plan.recommendedRank.rankTH}`}
                    value={`${data.current.totalActiveFA} คน`}
                    color="#22c55e"
                  />
                </div>
              </div>

              {/* Current structure summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Vol ซ้าย/เดือน', value: fmt(data.current.currMonthL), unit: 'BV', color: 'text-sky-400' },
                  { label: 'Vol ขวา/เดือน', value: fmt(data.current.currMonthR), unit: 'BV', color: 'text-purple-400' },
                  { label: 'Active FA ซ้าย', value: String(data.current.leftActiveFA), unit: 'คน', color: 'text-green-400' },
                  { label: 'Active FA ขวา', value: String(data.current.rightActiveFA), unit: 'คน', color: 'text-green-400' },
                ].map((s) => (
                  <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                    <p className="text-xs text-slate-400">{s.label}</p>
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-slate-500">{s.unit}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tab: Roadmap ── */}
          {activeTab === 'roadmap' && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">เส้นทางสู่ {fmtThb(goal)}/เดือน</h3>
                <p className="text-xs text-slate-500 mb-5">แต่ละขั้นคือ rank ที่ต้องผ่าน · ตัวเลขเป็นค่าประมาณตาม trend ปัจจุบัน</p>

                {/* Timeline */}
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-700" />

                  <div className="space-y-6 pl-14">
                    {/* Current */}
                    <div className="relative">
                      <div className="absolute -left-9 w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-xs font-bold text-white shadow-lg">
                        ●
                      </div>
                      <div className="bg-brand-900/30 border border-brand-700/50 rounded-xl p-3">
                        <p className="text-xs text-brand-400 font-mono">ตอนนี้</p>
                        <p className="font-bold text-white">{data.current.position}</p>
                        <p className="text-xs text-slate-400">
                          รายได้ ≈ {fmtThb(data.current.estimatedMonthlyIncome)}/เดือน ·
                          Minor {fmt(data.current.currMinorMonthly)} BV/เดือน
                        </p>
                      </div>
                    </div>

                    {data.milestones.map((m, i) => (
                      <div key={m.rank} className="relative">
                        <div className={`absolute -left-9 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-lg
                          ${i === data.milestones.length - 1 ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                          {i + 1}
                        </div>
                        <div className={`border rounded-xl p-3 ${i === data.milestones.length - 1 ? 'border-amber-600/60 bg-amber-900/10' : 'border-slate-700 bg-slate-800/30'}`}>
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <p className="text-xs text-slate-500 font-mono">เดือนที่ ~{m.monthsFromNow}</p>
                              <p className="font-bold text-white">{m.rankTH}</p>
                              <p className="text-xs text-slate-400">
                                Minor {fmt(m.minorBV)} BV/เดือน · Active FA {m.activeFA} คน/สาย
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-400">รายได้/เดือน</p>
                              <p className="text-lg font-bold text-green-400">{fmtThb(m.monthlyIncome)}</p>
                              {m.oneTimeBonus > 0 && (
                                <p className="text-xs text-amber-400">+{fmtThb(m.oneTimeBonus)} one-time</p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-3 mt-2 text-xs text-slate-500">
                            <span>ค่าทีม: <span className="text-sky-400">{fmtThb(m.teamComm)}</span></span>
                            <span>Matching: <span className="text-purple-400">{fmtThb(m.matching)}</span></span>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Goal reached */}
                    {data.milestones.length > 0 && (
                      <div className="relative">
                        <div className="absolute -left-9 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-lg shadow-lg">
                          🏆
                        </div>
                        <div className="border border-green-600/60 bg-green-900/10 rounded-xl p-3">
                          <p className="font-bold text-green-400">เป้าหมายสำเร็จ!</p>
                          <p className="text-xs text-slate-400">{fmtThb(goal)}/เดือน · {selectedGoal.sublabel}</p>
                          {data.plan.months_to_target > 0 && (
                            <p className="text-xs text-green-300 mt-1">
                              ประมาณ ~{data.plan.months_to_target} เดือน ({Math.ceil(data.plan.months_to_target / 12)} ปี {data.plan.months_to_target % 12 > 0 ? `${data.plan.months_to_target % 12} เดือน` : ''})
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Monthly income projection chart */}
              {data.milestones.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4">กราฟรายได้ตามเส้นทาง</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={[
                      { name: 'ตอนนี้', income: data.current.estimatedMonthlyIncome },
                      ...data.milestones.map((m) => ({ name: m.rankTH, income: m.monthlyIncome })),
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}K`} tick={{ fill: '#64748b', fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                        formatter={(v: number) => [fmtThb(v), 'รายได้/เดือน']}
                      />
                      <ReferenceLine y={goal} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'เป้าหมาย', fill: '#f59e0b', fontSize: 11 }} />
                      <Bar dataKey="income" radius={[6, 6, 0, 0]}>
                        {[{ income: data.current.estimatedMonthlyIncome }, ...data.milestones.map((m) => ({ income: m.monthlyIncome }))].map((entry, i) => (
                          <Cell key={i} fill={entry.income >= goal ? '#22c55e' : i === 0 ? '#0ea5e9' : '#6366f1'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Calculator ── */}
          {activeTab === 'calculator' && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-1">ตารางรายได้ตามตำแหน่ง</h3>
                <p className="text-xs text-slate-500 mb-4">Minor BV = Weak Leg Volume ต่อเดือน (ฝั่งที่น้อยกว่า)</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[640px]">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700">
                        <th className="text-left pb-2 pr-3 font-medium">ตำแหน่ง</th>
                        <th className="text-right pb-2 pr-3 font-medium text-sky-400">Minor BV/เดือน</th>
                        <th className="text-right pb-2 pr-3 font-medium">Active FA/สาย</th>
                        <th className="text-right pb-2 pr-3 font-medium text-green-400">ค่าทีม</th>
                        <th className="text-right pb-2 pr-3 font-medium text-purple-400">Matching</th>
                        <th className="text-right pb-2 pr-3 font-medium text-emerald-400">Matrix</th>
                        <th className="text-right pb-2 font-medium text-amber-400">รวม/เดือน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.allRankPotentials.map((r) => {
                        const isRecommended = r.rank === data.plan.recommendedRank.rank
                        const isCurrent = r.rank === data.current.position
                        return (
                          <tr
                            key={r.rank}
                            className={`border-b border-slate-800/50 transition-colors
                              ${isRecommended ? 'bg-brand-900/30' : isCurrent ? 'bg-slate-800/40' : 'hover:bg-slate-800/20'}`}
                          >
                            <td className="py-2 pr-3">
                              <span className="font-medium text-white">{r.rankTH}</span>
                              {isRecommended && <span className="ml-1.5 text-xs text-brand-400 bg-brand-900/50 px-1.5 py-0.5 rounded">เป้าหมาย</span>}
                              {isCurrent && <span className="ml-1.5 text-xs text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded">ตอนนี้</span>}
                            </td>
                            <td className="text-right pr-3 text-sky-400 font-mono">{fmt(r.minorBVRequired)}</td>
                            <td className="text-right pr-3 text-slate-300">{r.activeFARequired}</td>
                            <td className="text-right pr-3 text-green-400">{fmtThb(r.teamComm)}</td>
                            <td className="text-right pr-3 text-purple-400">
                              {fmtThb(r.matching)}
                              {r.matchingCap > 0 && <span className="text-slate-500 ml-1">(cap)</span>}
                            </td>
                            <td className="text-right pr-3 text-emerald-400">{fmtThb(r.matrixBonus)}</td>
                            <td className="text-right font-bold text-amber-400">{fmtThb(r.total)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Formula explainer */}
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-amber-400 font-semibold mb-2">⚡ ค่าทีม (Team Comm.)</p>
                  <p className="text-xs text-slate-300 font-mono">Minor BV × 5 = ฿/เดือน</p>
                  <p className="text-xs text-slate-500 mt-1">จับคู่ 200 BV = 1,000 บาท/คู่</p>
                  <p className="text-xs text-slate-600 mt-1">จ่ายทุกพฤหัส · cap 2.5 ล้าน</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-purple-400 font-semibold mb-2">🔗 Leadership Matching</p>
                  <p className="text-xs text-slate-300 font-mono">ค่าทีม Gen1 × 20%</p>
                  <p className="text-xs text-slate-500 mt-1">STAR→RUBY มี cap</p>
                  <p className="text-xs text-slate-600 mt-1">DIAMOND+ ไม่จำกัด</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-emerald-400 font-semibold mb-2">🌐 Matrix Bonus</p>
                  <p className="text-xs text-slate-300 font-mono">Active × ฿30/เดือน</p>
                  <p className="text-xs text-slate-500 mt-1">จ่ายวันที่ 15 ของเดือนถัดไป</p>
                  <p className="text-xs text-slate-600 mt-1">สูงสุด 5.24 ล้าน/เดือน</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-sky-400 font-semibold mb-2">👥 Referral Bonus</p>
                  <p className="text-xs text-slate-300 font-mono">BV × 5 = ฿ ต่อคน</p>
                  <p className="text-xs text-slate-500 mt-1">Pack 25,000 = 2,500 บาท/คน</p>
                  <p className="text-xs text-slate-600 mt-1">ชวน 2 คน/เดือน = 5,000 บาท</p>
                </div>
              </div>

              {/* Rank Advancement Bonus table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">โบนัสขึ้นตำแหน่ง (One-Time)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {data.allRankPotentials.map((r) => (
                    <div key={r.rank} className={`rounded-xl p-3 border text-center
                      ${r.rank === data.plan.recommendedRank.rank
                        ? 'border-amber-600/60 bg-amber-900/10'
                        : 'border-slate-700 bg-slate-800/30'}`}
                    >
                      <p className="text-xs text-slate-400">{r.rankTH}</p>
                      <p className="text-lg font-bold text-amber-400">{fmtThb(r.oneTimeBonus)}</p>
                      <p className="text-xs text-slate-500">{fmt(r.minorBVRequired)} BV/สาย</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Matrix Bonus ── */}
          {activeTab === 'matrix' && (
            <div className="space-y-4">
              {/* Current Matrix status */}
              <div className="bg-gradient-to-br from-emerald-950/60 to-slate-900 border border-emerald-700/50 rounded-2xl p-5">
                <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      🌐 Matrix Bonus ของคุณตอนนี้
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">฿{30} ต่อ Active สมาชิกในทีม · จ่ายวันที่ 15 ของเดือนถัดไป</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">รับได้/เดือนนี้</p>
                    <p className="text-3xl font-bold text-emerald-400">{fmtThb(data.current.matrixBonus)}</p>
                    <p className="text-xs text-slate-500">{data.current.totalActiveFA} คน Active ในทีม</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-400">Active ในทีม</p>
                    <p className="text-2xl font-bold text-emerald-400">{fmt(data.current.totalActiveFA)}</p>
                    <p className="text-xs text-slate-500">คน</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-400">฿30 × Active</p>
                    <p className="text-2xl font-bold text-white">{fmtThb(data.current.matrixBonus)}</p>
                    <p className="text-xs text-slate-500">เดือนนี้</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-400">Full Matrix ที่ {data.current.position}</p>
                    <p className="text-2xl font-bold text-amber-400">
                      {fmtThb(data.matrixLevels.find((m) => m.rank === data.current.position)?.potentialBonus ?? 0)}
                    </p>
                    <p className="text-xs text-slate-500">ศักยภาพสูงสุด</p>
                  </div>
                </div>
              </div>

              {/* Matrix Level table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-1">ตาราง Matrix Bonus ทุก Rank</h3>
                <p className="text-xs text-slate-500 mb-4">Matrix = Binary 2×N · ยิ่ง rank สูง ยิ่งได้ลึกมากขึ้น · จ่ายสูงสุด 5.24 ล้าน/เดือน</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[560px]">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700">
                        <th className="text-left pb-2 pr-3 font-medium">Rank</th>
                        <th className="text-right pb-2 pr-3 font-medium text-sky-400">Matrix Level</th>
                        <th className="text-right pb-2 pr-3 font-medium text-emerald-400">Active ที่ต้องการ</th>
                        <th className="text-right pb-2 pr-3 font-medium text-amber-400">Bonus เต็ม/เดือน</th>
                        <th className="text-right pb-2 font-medium text-purple-400">Bonus 30%/เดือน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.matrixLevels.map((ml) => {
                        const isCurrent = ml.rank === data.current.position
                        const bonus30 = Math.round(ml.potentialBonus * 0.3)
                        return (
                          <tr key={ml.rank}
                            className={`border-b border-slate-800/50 transition-colors
                              ${isCurrent ? 'bg-emerald-900/20' : 'hover:bg-slate-800/20'}`}>
                            <td className="py-2 pr-3">
                              <span className="font-medium text-white">{ml.rankTH}</span>
                              {isCurrent && <span className="ml-1.5 text-xs text-emerald-400 bg-emerald-900/40 px-1.5 py-0.5 rounded">ตอนนี้</span>}
                            </td>
                            <td className="text-right pr-3 text-sky-400 font-mono">{ml.matrixDepth}</td>
                            <td className="text-right pr-3 text-emerald-400 font-mono">{fmt(ml.requiredActive)}</td>
                            <td className="text-right pr-3 text-amber-400 font-bold">{fmtThb(ml.potentialBonus)}</td>
                            <td className="text-right text-purple-400">{fmtThb(bonus30)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-600 mt-3">* Bonus 30% = ประมาณการณ์ถ้า active เต็ม 30% ของ matrix</p>
              </div>

              {/* Matrix bar chart */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">กราฟ Matrix Bonus ตาม Rank</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.matrixLevels.map((ml) => ({
                    name: ml.rankTH,
                    full: ml.potentialBonus,
                    est30: Math.round(ml.potentialBonus * 0.3),
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9 }} angle={-30} textAnchor="end" height={45} />
                    <YAxis tickFormatter={(v) => v >= 1_000_000 ? `฿${(v/1_000_000).toFixed(1)}M` : `฿${(v/1000).toFixed(0)}K`} tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                      formatter={(v: unknown, name: unknown) => [typeof v === 'number' ? fmtThb(v) : String(v), name === 'full' ? 'Bonus เต็ม' : 'ประมาณ 30%']}
                    />
                    <Bar dataKey="est30" name="ประมาณ 30%" fill="#a855f7" radius={[0,0,0,0]} />
                    <Bar dataKey="full" name="Bonus เต็ม" fill="#10b981" radius={[4,4,0,0]} opacity={0.4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* How Matrix works */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">📖 Matrix Bonus ทำงานอย่างไร</h3>
                <div className="space-y-3 text-xs">
                  <div className="flex gap-3 p-3 bg-emerald-900/20 rounded-xl border border-emerald-800/40">
                    <span className="text-2xl">🌐</span>
                    <div>
                      <p className="font-semibold text-emerald-300">Binary 2×N Matrix</p>
                      <p className="text-slate-400 mt-0.5">ทุกคนในทีมมีที่นั่งในโครงสร้าง 2 ฝั่ง · ยิ่งลึกมากขึ้น matrix level ก็ขยาย (2¹+2²+…+2ⁿ members)</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 bg-sky-900/20 rounded-xl border border-sky-800/40">
                    <span className="text-2xl">💰</span>
                    <div>
                      <p className="font-semibold text-sky-300">฿30 ต่อ Active ในทีม</p>
                      <p className="text-slate-400 mt-0.5">ทุก Active & Qualified FA ในทีมของคุณ คุณได้ ฿30/เดือน โดยอัตโนมัติ · ไม่ต้องทำอะไรเพิ่ม</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 bg-amber-900/20 rounded-xl border border-amber-800/40">
                    <span className="text-2xl">🎯</span>
                    <div>
                      <p className="font-semibold text-amber-300">รักษา Active = เงินอัตโนมัติ</p>
                      <p className="text-slate-400 mt-0.5">ช่วย downline ให้ Active ทุกเดือน = Matrix Bonus เพิ่มขึ้นทุกเดือน · จ่ายวันที่ 15 ของเดือนถัดไป สูงสุด ฿5.24 ล้าน/เดือน</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 bg-purple-900/20 rounded-xl border border-purple-800/40">
                    <span className="text-2xl">📈</span>
                    <div>
                      <p className="font-semibold text-purple-300">FA ต้องรักษา Active & Qualified</p>
                      <p className="text-slate-400 mt-0.5">ต้องมีสถานะ Active (BV ครบ) และ Qualified (มีตัวแทนตรงซ้าย 1 ขวา 1) ทุกเดือน จึงจะนับเป็น Matrix Bonus</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Coach JOE ── */}
          {activeTab === 'coach' && (
            <div className="space-y-4">
              {/* Coach header */}
              <div className="bg-gradient-to-r from-slate-900 to-brand-900/20 border border-brand-700/40 rounded-2xl p-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-brand-600 flex items-center justify-center text-2xl shrink-0">
                    👨‍💼
                  </div>
                  <div>
                    <p className="font-bold text-white">Coach JOE แนะนำ</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      วิเคราะห์จากข้อมูลจริงของคุณ · เป้าหมาย {fmtThb(goal)}/เดือน ({selectedGoal.sublabel})
                    </p>
                    <p className="text-sm text-slate-300 mt-2">
                      ตอนนี้คุณอยู่ที่ <span className="text-brand-400 font-semibold">{data.current.position}</span> ·
                      รายได้ประมาณ <span className="text-green-400 font-semibold">{fmtThb(data.current.estimatedMonthlyIncome)}/เดือน</span> ·
                      ห่างจากเป้า <span className="text-amber-400 font-semibold">{fmtThb(data.gap.gapIncome)}/เดือน</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-brand-500 rounded-full" />
                  สิ่งที่ต้องทำ — เรียงตามความสำคัญ
                </h3>
                {data.coachActions.map((action, i) => {
                  const colors = {
                    high: { border: 'border-red-700/60', bg: 'bg-red-900/20', label: 'text-red-400', badge: 'เร่งด่วน' },
                    medium: { border: 'border-amber-700/60', bg: 'bg-amber-900/20', label: 'text-amber-400', badge: 'สำคัญ' },
                    low: { border: 'border-slate-700', bg: 'bg-slate-800/30', label: 'text-slate-400', badge: 'แนะนำ' },
                  }[action.priority]
                  return (
                    <div key={i} className={`border ${colors.border} ${colors.bg} rounded-xl p-4`}>
                      <div className="flex items-start gap-3">
                        <PriorityDot p={action.priority} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-xs font-medium ${colors.label} bg-slate-800 px-2 py-0.5 rounded`}>
                              {colors.badge}
                            </span>
                            <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded font-mono">
                              {action.impact}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-white">{action.title}</p>
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{action.detail}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Rank advancement theory */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">📖 หลักการสร้างรายได้ SPS</h3>
                <div className="space-y-3 text-xs">
                  <div className="flex gap-3 p-3 bg-sky-900/20 rounded-xl border border-sky-800/40">
                    <span className="text-2xl">🎯</span>
                    <div>
                      <p className="font-semibold text-sky-300">Minor Leg คือหัวใจ</p>
                      <p className="text-slate-400 mt-0.5">รายได้คำนวณจากขาที่ <strong>น้อยกว่า</strong> (Weak Leg) × 5 ฉะนั้นการ balance ซ้ายขวาสำคัญมาก</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 bg-purple-900/20 rounded-xl border border-purple-800/40">
                    <span className="text-2xl">⚡</span>
                    <div>
                      <p className="font-semibold text-purple-300">Leadership Matching คือ leverage</p>
                      <p className="text-slate-400 mt-0.5">ยิ่ง Gen 1 ทำค่าทีมเยอะ คุณได้ 20% โดยไม่ต้องทำเพิ่ม · ปลุก Gen 1 = ปลุกรายได้คุณ</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 bg-amber-900/20 rounded-xl border border-amber-800/40">
                    <span className="text-2xl">🌱</span>
                    <div>
                      <p className="font-semibold text-amber-300">Active FA = กุญแจขึ้นตำแหน่ง</p>
                      <p className="text-slate-400 mt-0.5">ไม่ว่า Vol จะสูงแค่ไหน ถ้า Active FA ต่อสายไม่ถึง rank ก็ขึ้นไม่ได้ · ต้องพัฒนาคนควบคู่กับ Vol</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 bg-green-900/20 rounded-xl border border-green-800/40">
                    <span className="text-2xl">💎</span>
                    <div>
                      <p className="font-semibold text-green-300">DIAMOND = รายได้ไม่จำกัด</p>
                      <p className="text-slate-400 mt-0.5">ตั้งแต่ Diamond ขึ้นไป Leadership Matching ไม่มี cap · ยิ่งองค์กรโต รายได้โตแบบ exponential</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Weekly action plan */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">📅 แผนสัปดาห์นี้ (Quick Wins)</h3>
                <div className="space-y-2">
                  {[
                    { day: 'จ-อ', action: 'ชวนสมาชิกใหม่ 1-2 คน (Referral Bonus ฿2,500-5,000 ทันที)', icon: '📞' },
                    { day: 'พ-พฤ', action: 'ติดตาม Gen 1 Inactive — ทำ Start Up ร่วมกัน เพิ่ม Matching Bonus', icon: '🤝' },
                    { day: 'ศ-ส', action: `โฟกัส Weak Leg (สาย${Math.min(data.current.currMonthL, data.current.currMonthR) === data.current.currMonthL ? 'ซ้าย' : 'ขวา'}) ช่วย downline ทำ BV`, icon: '📊' },
                    { day: 'อา', action: 'ดู Dashboard ตรวจ Vol L/R · วางแผนสัปดาห์ถัดไป', icon: '🎯' },
                  ].map((item) => (
                    <div key={item.day} className="flex items-start gap-3 p-3 bg-slate-800/40 rounded-xl">
                      <span className="text-lg">{item.icon}</span>
                      <div>
                        <span className="text-xs text-brand-400 font-mono font-bold">{item.day}</span>
                        <p className="text-xs text-slate-300 mt-0.5">{item.action}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
