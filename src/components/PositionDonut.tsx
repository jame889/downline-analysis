'use client'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { POSITION_COLOR, POSITION_LABEL } from '@/lib/types'

interface LRPoint { left: number; right: number }

interface Props {
  counts: Record<string, number>
  latestLR?: LRPoint
  totalMembers?: number
  activeMembers?: number
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-white font-medium">{d.name}</p>
      <p className="text-slate-300 mt-1">{d.value} คน</p>
    </div>
  )
}

export default function PositionDonut({ counts, latestLR, totalMembers, activeMembers }: Props) {
  const data = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: POSITION_LABEL[k as keyof typeof POSITION_LABEL] ?? k, value: v, key: k }))

  const leftVol = latestLR?.left ?? 0
  const rightVol = latestLR?.right ?? 0
  const total = leftVol + rightVol

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-slate-300 mb-1">สัดส่วนตำแหน่ง</h2>

      {/* L/R mini stats */}
      {latestLR && total > 0 && (
        <div className="flex gap-3 mb-3 text-xs">
          <div className="flex-1 bg-slate-800/60 rounded-lg px-3 py-2">
            <p className="text-slate-400 mb-0.5">Vol ซ้าย</p>
            <p className="text-sky-400 font-bold">{leftVol.toLocaleString()}</p>
            <p className="text-slate-600">฿{(leftVol * 50).toLocaleString()}</p>
          </div>
          <div className="flex-1 bg-slate-800/60 rounded-lg px-3 py-2">
            <p className="text-slate-400 mb-0.5">Vol ขวา</p>
            <p className="text-purple-400 font-bold">{rightVol.toLocaleString()}</p>
            <p className="text-slate-600">฿{(rightVol * 50).toLocaleString()}</p>
          </div>
          <div className="flex-1 bg-amber-950/30 border border-amber-800/30 rounded-lg px-3 py-2">
            <p className="text-amber-400 mb-0.5">Weak Leg</p>
            <p className="text-amber-400 font-bold">{Math.min(leftVol, rightVol).toLocaleString()}</p>
            <p className="text-amber-800">{leftVol <= rightVol ? 'ซ้าย' : 'ขวา'}</p>
          </div>
        </div>
      )}

      {/* L/R balance bar */}
      {total > 0 && (
        <div className="mb-3">
          <div className="flex rounded-full overflow-hidden h-2 bg-slate-800">
            <div
              className="bg-sky-500 transition-all"
              style={{ width: `${(leftVol / total) * 100}%` }}
            />
            <div className="flex-1 bg-purple-500" />
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>{((leftVol / total) * 100).toFixed(1)}% ซ้าย</span>
            <span>ขวา {((rightVol / total) * 100).toFixed(1)}%</span>
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3}>
            {data.map((d) => (
              <Cell key={d.key} fill={POSITION_COLOR[d.key] ?? '#475569'} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
