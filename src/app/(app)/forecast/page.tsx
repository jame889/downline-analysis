'use client'
import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'

interface ChartPoint {
  month: string
  value: number
  type: 'actual' | 'forecast'
}

interface TrendSummary {
  metric: string
  growth_rate: number
  current: number
  forecast_next: number
}

interface ProjectionRow {
  month: string
  members: number
  bv: number
  vol_left: number
  vol_right: number
}

interface ForecastData {
  memberChart: ChartPoint[]
  bvChart: ChartPoint[]
  volLeftChart: ChartPoint[]
  volRightChart: ChartPoint[]
  trends: TrendSummary[]
  projectionTable: ProjectionRow[]
}

function TrendCard({ trend }: { trend: TrendSummary }) {
  const isPositive = trend.growth_rate >= 0
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-xs text-slate-400 mb-1">{trend.metric}</p>
      <p className="text-2xl font-bold text-white">{trend.current.toLocaleString()}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className={`text-xs font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          {isPositive ? '+' : ''}{trend.growth_rate.toFixed(1)}%
        </span>
        <span className="text-xs text-slate-500">&rarr; {trend.forecast_next.toLocaleString()}</span>
      </div>
    </div>
  )
}

function ForecastChart({ title, data, color }: { title: string; data: ChartPoint[]; color: string }) {
  // Split into actual and forecast for different line styles
  const chartData = data.map((d) => ({
    month: d.month,
    actual: d.type === 'actual' ? d.value : undefined,
    forecast: d.type === 'forecast' ? d.value : undefined,
    // Bridge: last actual point also appears in forecast for continuity
  }))

  // Find the bridge point (last actual)
  const lastActualIdx = data.findLastIndex((d) => d.type === 'actual')
  if (lastActualIdx >= 0 && lastActualIdx < chartData.length - 1) {
    chartData[lastActualIdx].forecast = chartData[lastActualIdx].actual
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-slate-300 mb-4">{title}</h2>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
            formatter={(v: unknown) => typeof v === 'number' ? v.toLocaleString() : '-'}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="actual"
            name="ข้อมูลจริง"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color }}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            name="คาดการณ์"
            stroke={color}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={{ r: 3, fill: color, strokeDasharray: '' }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function ForecastPage() {
  const [data, setData] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/forecast')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-slate-400 py-16 text-center">กำลังวิเคราะห์...</div>
  if (!data) return <div className="text-slate-400 py-16 text-center">ไม่พบข้อมูล</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">คาดการณ์ / Forecast</h1>
        <p className="text-slate-400 text-sm mt-1">ประมาณการแนวโน้มจากข้อมูลย้อนหลัง</p>
      </div>

      {/* Trend summary cards */}
      {data.trends && data.trends.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {data.trends.map((t) => (
            <TrendCard key={t.metric} trend={t} />
          ))}
        </div>
      )}

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        {data.memberChart?.length > 0 && (
          <ForecastChart title="จำนวนสมาชิก" data={data.memberChart} color="#38bdf8" />
        )}
        {data.bvChart?.length > 0 && (
          <ForecastChart title="BV รวม" data={data.bvChart} color="#a78bfa" />
        )}
        {data.volLeftChart?.length > 0 && (
          <ForecastChart title="Vol ซ้าย" data={data.volLeftChart} color="#0ea5e9" />
        )}
        {data.volRightChart?.length > 0 && (
          <ForecastChart title="Vol ขวา" data={data.volRightChart} color="#8b5cf6" />
        )}
      </div>

      {/* Projection table */}
      {data.projectionTable && data.projectionTable.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-300">ถ้า trend เป็นแบบนี้ต่อ</h2>
            <p className="text-xs text-slate-500 mt-0.5">ตารางประมาณการ 3-6 เดือนข้างหน้า</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs border-b border-slate-800">
                  <th className="text-left px-4 py-3">เดือน</th>
                  <th className="text-right px-4 py-3">สมาชิก</th>
                  <th className="text-right px-4 py-3">BV</th>
                  <th className="text-right px-4 py-3">Vol ซ้าย</th>
                  <th className="text-right px-4 py-3">Vol ขวา</th>
                </tr>
              </thead>
              <tbody>
                {data.projectionTable.map((row) => (
                  <tr key={row.month} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 text-slate-300 font-mono">{row.month}</td>
                    <td className="px-4 py-2.5 text-right text-brand-400">{row.members.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-purple-400">{row.bv.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-sky-400">{row.vol_left.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-purple-400">{row.vol_right.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
