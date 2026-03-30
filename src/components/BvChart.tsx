'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, LabelList
} from 'recharts'
import type { MonthlySummary } from '@/lib/types'

interface LRPoint { month: string; left: number; right: number }
interface Props {
  summaries: MonthlySummary[]
  lrData: LRPoint[]
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const left = payload.find((p: any) => p.dataKey === 'Vol ซ้าย')?.value ?? 0
  const right = payload.find((p: any) => p.dataKey === 'Vol ขวา')?.value ?? 0
  const weak = Math.min(left, right)
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs space-y-1.5 shadow-xl">
      <p className="text-slate-300 font-medium mb-2">{label}</p>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 inline-block" />
        <span className="text-slate-400">Vol ซ้าย:</span>
        <span className="text-sky-400 font-bold">{left.toLocaleString()}</span>
        <span className="text-slate-600">฿{(left * 50).toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-sm bg-purple-500 inline-block" />
        <span className="text-slate-400">Vol ขวา:</span>
        <span className="text-purple-400 font-bold">{right.toLocaleString()}</span>
        <span className="text-slate-600">฿{(right * 50).toLocaleString()}</span>
      </div>
      <div className="border-t border-slate-800 pt-1.5 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
        <span className="text-slate-400">Weak Leg:</span>
        <span className="text-amber-400 font-bold">{weak.toLocaleString()}</span>
        <span className={left > right ? 'text-purple-500 text-xs' : 'text-sky-500 text-xs'}>
          ({left > right ? 'ขวา' : 'ซ้าย'})
        </span>
      </div>
    </div>
  )
}

export default function BvChart({ summaries, lrData }: Props) {
  const lrMap = new Map(lrData.map((d) => [d.month, d]))

  const data = summaries.map((s) => {
    const lr = lrMap.get(s.month) ?? { left: 0, right: 0 }
    const weak = Math.min(lr.left, lr.right)
    return {
      month: s.month.slice(2),
      'Vol ซ้าย': lr.left,
      'Vol ขวา': lr.right,
      'Weak Leg': weak,
    }
  })

  const latestLeft = lrData[lrData.length - 1]?.left ?? 0
  const latestRight = lrData[lrData.length - 1]?.right ?? 0
  const weakSide = latestLeft <= latestRight ? 'ซ้าย' : 'ขวา'

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-300">Vol สะสม ซ้าย vs ขวา รายเดือน</h2>
        <span className="text-xs text-amber-400 bg-amber-900/30 border border-amber-800/40 px-2 py-0.5 rounded-full">
          Weak: {weakSide}
        </span>
      </div>
      {/* Latest L/R values */}
      <div className="flex gap-4 mb-4 text-xs">
        <span className="text-sky-400">ซ้าย {latestLeft.toLocaleString()}</span>
        <span className="text-slate-600">|</span>
        <span className="text-purple-400">ขวา {latestRight.toLocaleString()}</span>
        <span className="text-slate-600">|</span>
        <span className="text-amber-400">Weak {Math.min(latestLeft, latestRight).toLocaleString()}</span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} barGap={3}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Vol ซ้าย" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Vol ขวา" fill="#a855f7" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Weak Leg" fill="#f59e0b" radius={[3, 3, 0, 0]} opacity={0.6} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
