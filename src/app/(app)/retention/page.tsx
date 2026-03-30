'use client'
import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'

interface CohortRow {
  cohort_month: string
  data: { month: string; retention_pct: number }[]
}

interface RetentionData {
  cohorts: CohortRow[]
  overallRetention: { month: string; retention_pct: number }[]
  summary: {
    avg_1_month: number
    avg_3_month: number
    current_active_rate: number
  }
}

function retentionColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500/80 text-white'
  if (pct >= 60) return 'bg-green-700/60 text-green-100'
  if (pct >= 40) return 'bg-amber-700/50 text-amber-100'
  if (pct >= 20) return 'bg-red-800/50 text-red-200'
  return 'bg-red-900/60 text-red-300'
}

export default function RetentionPage() {
  const [data, setData] = useState<RetentionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/retention')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-slate-400 py-16 text-center">กำลังโหลด...</div>
  if (!data) return <div className="text-slate-400 py-16 text-center">ไม่พบข้อมูล</div>

  // Get all unique subsequent months across cohorts for columns
  const allMonths = Array.from(
    new Set(data.cohorts.flatMap((c) => c.data.map((d) => d.month)))
  ).sort()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Retention / Cohort Analysis</h1>
        <p className="text-slate-400 text-sm mt-1">วิเคราะห์การรักษาสมาชิกแบ่งตาม cohort เดือนที่สมัคร</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs text-slate-400 mb-1">Retention เฉลี่ย 1 เดือน</p>
          <p className={`text-3xl font-bold ${data.summary.avg_1_month >= 50 ? 'text-green-400' : 'text-red-400'}`}>
            {data.summary.avg_1_month.toFixed(1)}%
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs text-slate-400 mb-1">Retention เฉลี่ย 3 เดือน</p>
          <p className={`text-3xl font-bold ${data.summary.avg_3_month >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
            {data.summary.avg_3_month.toFixed(1)}%
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs text-slate-400 mb-1">Active Rate ปัจจุบัน</p>
          <p className={`text-3xl font-bold ${data.summary.current_active_rate >= 50 ? 'text-green-400' : 'text-amber-400'}`}>
            {data.summary.current_active_rate.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Overall retention line chart */}
      {data.overallRetention && data.overallRetention.length > 1 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Retention Rate รายเดือน</h2>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.overallRetention}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} unit="%" />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                formatter={(v: number) => `${v.toFixed(1)}%`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="retention_pct"
                name="Retention %"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 3, fill: '#22c55e' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cohort heatmap table */}
      {data.cohorts && data.cohorts.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Cohort Heatmap</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-left px-3 py-2 sticky left-0 bg-slate-900 z-10">Cohort</th>
                  {allMonths.map((m) => (
                    <th key={m} className="text-center px-2 py-2 whitespace-nowrap">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.cohorts.map((cohort) => {
                  const dataMap = new Map(cohort.data.map((d) => [d.month, d.retention_pct]))
                  return (
                    <tr key={cohort.cohort_month} className="border-b border-slate-800/50">
                      <td className="px-3 py-2 text-slate-300 font-mono sticky left-0 bg-slate-900 z-10">
                        {cohort.cohort_month}
                      </td>
                      {allMonths.map((m) => {
                        const pct = dataMap.get(m)
                        if (pct === undefined) {
                          return <td key={m} className="px-2 py-2 text-center text-slate-700">-</td>
                        }
                        return (
                          <td key={m} className="px-1 py-1 text-center">
                            <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${retentionColor(pct)}`}>
                              {pct.toFixed(0)}%
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
