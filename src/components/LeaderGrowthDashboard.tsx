'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { GrowthDashboardData, RankReadiness } from '@/lib/growth'

interface MemberOption { id: string; name: string }
interface Props {
  data: GrowthDashboardData
  members: MemberOption[]
  canSelectMember: boolean
  window: number
}

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function monthLabel(month: string) {
  const [year, m] = month.split('-').map(Number)
  return `${THAI_MONTHS[m - 1]} ${String(year + 543).slice(-2)}`
}

function formatRatio(value: number) {
  if (!Number.isFinite(value)) return '0.00x'
  return `${value.toFixed(2)}x`
}

function KpiCard({ label, value, sub, tone = 'slate' }: { label: string; value: string; sub?: string; tone?: 'cyan' | 'gold' | 'green' | 'amber' | 'slate' }) {
  const styles = {
    cyan: 'border-cyan-800/60 bg-cyan-950/20 text-cyan-300',
    gold: 'border-amber-700/60 bg-amber-950/20 text-amber-300',
    green: 'border-green-800/60 bg-green-950/20 text-green-300',
    amber: 'border-orange-800/60 bg-orange-950/20 text-orange-300',
    slate: 'border-slate-800 bg-slate-900 text-white',
  }[tone]
  return (
    <div className={`rounded-2xl border p-4 ${styles}`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{sub}</p>}
    </div>
  )
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-xs shadow-2xl">
      <p className="font-semibold text-slate-200 mb-2">{label}</p>
      {payload.map((item: any) => (
        <div key={item.dataKey} className="flex items-center justify-between gap-5 py-0.5">
          <span className="flex items-center gap-2 text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.name}
          </span>
          <span className="font-semibold text-white">{Number(item.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

function Progress({ value, tone }: { value: number; tone: 'cyan' | 'gold' }) {
  return (
    <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
      <div
        className={tone === 'cyan' ? 'h-full bg-cyan-400' : 'h-full bg-amber-400'}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

function ReadinessCard({ readiness }: { readiness: RankReadiness }) {
  const isGold = readiness.code === 'GD'
  return (
    <div className={`rounded-2xl border p-5 ${isGold ? 'border-amber-700/50 bg-amber-950/10' : 'border-cyan-800/50 bg-cyan-950/10'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Rank Readiness</p>
          <h3 className={`text-xl font-bold mt-1 ${isGold ? 'text-amber-300' : 'text-cyan-300'}`}>{readiness.label}</h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${readiness.qualified ? 'bg-green-500/15 text-green-300' : 'bg-slate-800 text-slate-400'}`}>
          {readiness.qualified ? 'พร้อมผ่านเงื่อนไข' : 'ยังไม่ครบ'}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mt-5">
        <div className="rounded-xl bg-slate-950/50 border border-cyan-900/40 p-3">
          <div className="flex justify-between text-xs mb-2"><span className="text-cyan-300">ฝั่งซ้าย</span><span className="text-slate-400">{readiness.leftPct}%</span></div>
          <Progress value={readiness.leftPct} tone="cyan" />
          <p className="text-lg font-bold text-white mt-2">{readiness.currentLeft.toLocaleString()} <span className="text-xs text-slate-500">/ {readiness.targetLeft.toLocaleString()} BV</span></p>
          <p className="text-xs text-slate-500 mt-1">ขาด {readiness.leftGap.toLocaleString()} BV · Placement {readiness.leftPlacement ? '✓' : 'ยังไม่ครบ'}</p>
        </div>
        <div className="rounded-xl bg-slate-950/50 border border-amber-900/40 p-3">
          <div className="flex justify-between text-xs mb-2"><span className="text-amber-300">ฝั่งขวา</span><span className="text-slate-400">{readiness.rightPct}%</span></div>
          <Progress value={readiness.rightPct} tone="gold" />
          <p className="text-lg font-bold text-white mt-2">{readiness.currentRight.toLocaleString()} <span className="text-xs text-slate-500">/ {readiness.targetRight.toLocaleString()} BV</span></p>
          <p className="text-xs text-slate-500 mt-1">ขาด {readiness.rightGap.toLocaleString()} BV · Placement {readiness.rightPlacement ? '✓' : 'ยังไม่ครบ'}</p>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-3">Placement ที่ต้องการ: {readiness.requiredPlacement} อย่างน้อยฝั่งละ 1 คน · ควรตรวจ Active ประกอบก่อนยืนยันตำแหน่ง</p>
    </div>
  )
}

function statusClass(status: 'green' | 'yellow' | 'red') {
  if (status === 'green') return 'bg-green-500/15 text-green-300 border-green-700/40'
  if (status === 'yellow') return 'bg-amber-500/15 text-amber-300 border-amber-700/40'
  return 'bg-red-500/10 text-red-300 border-red-800/40'
}

export default function LeaderGrowthDashboard({ data, members, canSelectMember, window }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const chartData = data.points.map((point) => ({ ...point, label: monthLabel(point.month) }))

  function updateQuery(member: string, months: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('member', member)
    params.set('months', String(months))
    router.push(`/growth?${params.toString()}`)
  }

  const rightToLeft = data.latest.totalLeft > 0 ? data.latest.totalRight / data.latest.totalLeft : 0
  const momentumPct = Math.round((data.momentumRatio - 1) * 100)

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-amber-400">Leader Growth Command Center</p>
            <h1 className="text-2xl md:text-3xl font-bold text-white mt-2">{data.member.name}</h1>
            <p className="text-sm text-slate-400 mt-1">{data.member.id} · วิเคราะห์ซ้าย–ขวา {data.points.length} เดือน · ล่าสุด {monthLabel(data.latest.month)}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {canSelectMember && (
              <select
                value={data.member.id}
                onChange={(event) => updateQuery(event.target.value, window)}
                className="min-w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                {members.map((member) => <option key={member.id} value={member.id}>{member.id} — {member.name}</option>)}
              </select>
            )}
            <select
              value={window}
              onChange={(event) => updateQuery(data.member.id, Number(event.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
            >
              <option value={3}>ย้อนหลัง 3 เดือน</option>
              <option value={6}>ย้อนหลัง 6 เดือน</option>
              <option value={9}>ย้อนหลัง 9 เดือน</option>
              <option value={12}>ย้อนหลัง 12 เดือน</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="ยอดรวมฝั่งซ้าย" value={`${data.latest.totalLeft.toLocaleString()} BV`} sub={`เริ่ม ${data.start.totalLeft.toLocaleString()} · พีค ${data.peakLeft.totalLeft.toLocaleString()}`} tone="cyan" />
        <KpiCard label="ยอดรวมฝั่งขวา" value={`${data.latest.totalRight.toLocaleString()} BV`} sub={`เริ่ม ${data.start.totalRight.toLocaleString()} · พีค ${data.peakRight.totalRight.toLocaleString()}`} tone="gold" />
        <KpiCard label="Balance Strength" value={`${Math.round(data.balanceRatio * 100)}%`} sub={`Weak Leg: ฝั่ง${data.weakSide} · ขวา/ซ้าย ${formatRatio(rightToLeft)}`} tone="amber" />
        <KpiCard label="Momentum ล่าสุด" value={`${momentumPct >= 0 ? '+' : ''}${momentumPct}%`} sub={`${(data.latest.newLeft + data.latest.newRight).toLocaleString()} BV ใหม่ · Active consistency ${data.activeConsistency}%`} tone={momentumPct >= 0 ? 'green' : 'amber'} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Sponsor 3 เดือน" value={`${data.sponsorLast3} คน`} sub={`เฉลี่ย ${data.sponsorAverage.toFixed(1)} คน/เดือน · พลังความมุ่งมั่น`} tone="cyan" />
        <KpiCard label="Moving Up 3 เดือน" value={`${data.movingUpsLast3} ครั้ง`} sub={`เฉลี่ย ${data.movingUpAverage.toFixed(1)} ครั้ง/เดือน · พลังโฟกัส`} tone="gold" />
        <KpiCard label="การเติบโตฝั่งซ้าย" value={`${data.leftGrowthPct >= 0 ? '+' : ''}${data.leftGrowthPct.toFixed(1)}%`} sub={`${monthLabel(data.start.month)} → ${monthLabel(data.latest.month)}`} tone={data.leftGrowthPct >= 0 ? 'cyan' : 'amber'} />
        <KpiCard label="การเติบโตฝั่งขวา" value={`${data.rightGrowthPct >= 0 ? '+' : ''}${data.rightGrowthPct.toFixed(1)}%`} sub={`${monthLabel(data.start.month)} → ${monthLabel(data.latest.month)}`} tone={data.rightGrowthPct >= 0 ? 'gold' : 'amber'} />
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-white">ยอดรวมฝั่งซ้าย–ขวา</h2>
            <p className="text-xs text-slate-500 mt-1">ใช้ดูฐานองค์กร จุดพีค และความสมดุลระยะยาว</p>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(value) => value >= 1000 ? `${Math.round(value / 1000)}k` : value} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="totalLeft" name="ฝั่งซ้าย" stroke="#22d3ee" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="totalRight" name="ฝั่งขวา" stroke="#fbbf24" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-white">BV ที่เกิดใหม่รายเดือน</h2>
            <p className="text-xs text-slate-500 mt-1">Leading indicator สำหรับวัด Momentum ก่อนยอดรวมและตำแหน่งเปลี่ยน</p>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(value) => value >= 1000 ? `${Math.round(value / 1000)}k` : value} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="newLeft" name="BV ใหม่ซ้าย" fill="#0891b2" radius={[4, 4, 0, 0]} />
              <Bar dataKey="newRight" name="BV ใหม่ขวา" fill="#d97706" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <ReadinessCard readiness={data.gold} />
        <ReadinessCard readiness={data.diamond} />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-2 mb-4">
          <div>
            <h2 className="font-semibold text-white">Leadership Timeline</h2>
            <p className="text-xs text-slate-500 mt-1">ตำแหน่งรายได้ ผู้นำสูงสุดซ้าย–ขวา Sponsor และ Moving Up ในแต่ละเดือน</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-cyan-300">Sponsor = Commitment</span>
            <span className="rounded-full bg-amber-500/10 px-2 py-1 text-amber-300">Moving Up = Focus</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="text-left py-2 pr-3">เดือน</th>
                <th className="text-center py-2 px-2">ตำแหน่งรายได้</th>
                <th className="text-center py-2 px-2">สูงสุด</th>
                <th className="text-center py-2 px-2 text-cyan-400">ผู้นำซ้าย</th>
                <th className="text-center py-2 px-2 text-amber-400">ผู้นำขวา</th>
                <th className="text-right py-2 px-2">Sponsor</th>
                <th className="text-right py-2 px-2">Moving Up</th>
                <th className="text-right py-2 px-2">BV ใหม่ซ้าย</th>
                <th className="text-right py-2 pl-2">BV ใหม่ขวา</th>
              </tr>
            </thead>
            <tbody>
              {[...data.points].reverse().map((point) => (
                <tr key={point.month} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="py-2.5 pr-3 text-slate-300">{monthLabel(point.month)}</td>
                  <td className="text-center px-2 font-semibold text-white">{point.incomePosition}</td>
                  <td className="text-center px-2 text-slate-300">{point.highestPosition}</td>
                  <td className="text-center px-2 text-cyan-300">{point.leftHighestPosition}</td>
                  <td className="text-center px-2 text-amber-300">{point.rightHighestPosition}</td>
                  <td className="text-right px-2 text-cyan-300">{point.sponsored}</td>
                  <td className="text-right px-2 text-amber-300">{point.movingUps}</td>
                  <td className="text-right px-2 text-cyan-300">{point.newLeft.toLocaleString()}</td>
                  <td className="text-right pl-2 text-amber-300">{point.newRight.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4">
          <h2 className="font-semibold text-white">AI Coaching Priority — คนที่ควร Focus ก่อน</h2>
          <p className="text-xs text-slate-500 mt-1">คะแนนรวม Active consistency, Sponsor Rate, Moving Up, Momentum, การสร้างผู้นำ และผลกระทบต่อ Weak Leg</p>
        </div>
        {data.focusCandidates.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">ยังไม่มีข้อมูลเพียงพอสำหรับจัดอันดับ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="text-left py-2 pr-3">Priority</th>
                  <th className="text-left py-2 px-2">ผู้นำ</th>
                  <th className="text-center py-2 px-2">ฝั่ง</th>
                  <th className="text-center py-2 px-2">Rank</th>
                  <th className="text-right py-2 px-2">Sponsor 3M</th>
                  <th className="text-right py-2 px-2">Moving Up 3M</th>
                  <th className="text-right py-2 px-2">Leader ต่อ</th>
                  <th className="text-right py-2 px-2">Momentum</th>
                  <th className="text-right py-2 px-2">Active</th>
                  <th className="text-left py-2 pl-3">คำแนะนำ</th>
                </tr>
              </thead>
              <tbody>
                {data.focusCandidates.map((candidate, index) => (
                  <tr key={candidate.id} className="border-b border-slate-800/60 align-top hover:bg-slate-800/30">
                    <td className="py-3 pr-3">
                      <span className={`inline-flex min-w-14 justify-center rounded-lg border px-2 py-1 font-bold ${statusClass(candidate.status)}`}>#{index + 1} · {candidate.score}</span>
                    </td>
                    <td className="py-3 px-2">
                      <p className="font-semibold text-white">{candidate.name}</p>
                      <p className="text-slate-500 mt-0.5">{candidate.id}</p>
                    </td>
                    <td className={`text-center py-3 px-2 ${candidate.side === 'ซ้าย' ? 'text-cyan-300' : candidate.side === 'ขวา' ? 'text-amber-300' : 'text-slate-500'}`}>{candidate.side}</td>
                    <td className="text-center py-3 px-2 font-semibold text-white">{candidate.position}</td>
                    <td className="text-right py-3 px-2 text-cyan-300">{candidate.sponsorLast3}</td>
                    <td className="text-right py-3 px-2 text-amber-300">{candidate.movingUpsLast3}</td>
                    <td className="text-right py-3 px-2 text-purple-300">{candidate.leadersCreated}</td>
                    <td className="text-right py-3 px-2 text-white">{formatRatio(candidate.momentumRatio)}</td>
                    <td className="text-right py-3 px-2 text-green-300">{candidate.activeConsistency}%</td>
                    <td className="py-3 pl-3 text-slate-300 leading-relaxed max-w-sm">{candidate.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-semibold text-white">Strategic Insights</h2>
          <div className="space-y-3 mt-4">
            {data.insights.map((insight, index) => (
              <div key={insight} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-xs font-bold text-amber-300">{index + 1}</span>
                <p className="text-sm text-slate-300 leading-relaxed">{insight}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-amber-800/40 bg-gradient-to-br from-amber-950/20 to-slate-900 p-5">
          <h2 className="font-semibold text-amber-300">ภารกิจ 90 วัน</h2>
          <div className="space-y-4 mt-4 text-sm">
            <div><p className="font-semibold text-white">30 วัน — Stabilize</p><p className="text-slate-400 mt-1">รักษาฝั่งแข็งแรงและดันฝั่ง{data.weakSide}ให้สูงกว่าฐานปัจจุบันอย่างน้อย 25% พร้อมเลือก Focus Candidate 2–3 คน</p></div>
            <div><p className="font-semibold text-white">31–60 วัน — Accelerate</p><p className="text-slate-400 mt-1">ให้ Candidate แต่ละคนสร้าง Star/Bronze ใหม่ และเพิ่ม Moving Up อย่างน้อย 1 ครั้งต่อเดือน</p></div>
            <div><p className="font-semibold text-white">61–90 วัน — Qualify</p><p className="text-slate-400 mt-1">ปิด Gap Gold ซ้าย {data.gold.leftGap.toLocaleString()} BV / ขวา {data.gold.rightGap.toLocaleString()} BV พร้อมตรวจ Active และ Placement Tree</p></div>
          </div>
          <p className="mt-5 rounded-xl border border-amber-700/40 bg-black/20 p-3 text-sm font-semibold text-amber-200">เป้าหมายไม่ใช่แตะตำแหน่งเดือนเดียว แต่สร้างระบบที่ทำให้ตำแหน่งเกิดซ้ำได้</p>
        </div>
      </div>
    </div>
  )
}
