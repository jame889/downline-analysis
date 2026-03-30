'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine
} from 'recharts'

interface DataPoint {
  month: string
  left: number
  right: number
}

interface Props {
  data: DataPoint[]
  title?: string
}

export default function VolLRChart({ data, title = 'ปริมาณ Vol ซ้าย / ขวา' }: Props) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-slate-300 mb-4">{title}</h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
            labelStyle={{ color: '#94a3b8' }}
            formatter={(v: number, name: string) => [v.toLocaleString(), name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="left" name="Vol ซ้าย" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
          <Bar dataKey="right" name="Vol ขวา" fill="#a855f7" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
