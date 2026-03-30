'use client'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import type { MonthlySummary } from '@/lib/types'

interface LRPoint { month: string; left: number; right: number }
interface Props {
  summaries: MonthlySummary[]
  lrData: LRPoint[]
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs space-y-1 shadow-xl">
      <p className="text-slate-300 font-medium mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="text-white font-medium">{Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

export default function GrowthChart({ summaries, lrData }: Props) {
  // Merge member counts + vol L/R into one data array (keyed by month slug)
  const lrMap = new Map(lrData.map((d) => [d.month, d]))

  const data = summaries.map((s) => {
    const slug = s.month.slice(2)
    const lr = lrMap.get(s.month) ?? { left: 0, right: 0 }
    return {
      month: slug,
      สมาชิกทั้งหมด: s.total_members,
      Active: s.active_members,
      'Vol ซ้าย': lr.left,
      'Vol ขวา': lr.right,
    }
  })

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-300">การเติบโตของสมาชิก</h2>
        <div className="flex gap-3 text-xs">
          <span className="text-sky-400">▬ Vol ซ้าย</span>
          <span className="text-purple-400">▬ Vol ขวา</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
          {/* Left Y: member counts */}
          <YAxis yAxisId="members" orientation="left" tick={{ fill: '#64748b', fontSize: 11 }} />
          {/* Right Y: volume */}
          <YAxis yAxisId="vol" orientation="right" tick={{ fill: '#64748b', fontSize: 11 }}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />

          {/* Member lines on left axis */}
          <Line yAxisId="members" type="monotone" dataKey="สมาชิกทั้งหมด" stroke="#0ea5e9" strokeWidth={2} dot={false} />
          <Line yAxisId="members" type="monotone" dataKey="Active" stroke="#22c55e" strokeWidth={2} dot={false} />

          {/* Vol bars on right axis */}
          <Bar yAxisId="vol" dataKey="Vol ซ้าย" fill="#0369a1" opacity={0.7} radius={[2, 2, 0, 0]} barSize={12} />
          <Bar yAxisId="vol" dataKey="Vol ขวา" fill="#7e22ce" opacity={0.7} radius={[2, 2, 0, 0]} barSize={12} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
