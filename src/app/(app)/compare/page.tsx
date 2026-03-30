'use client'
import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'

interface SummaryDelta {
  total_members: { m1: number; m2: number; delta: number }
  active_members: { m1: number; m2: number; delta: number }
  total_bv: { m1: number; m2: number; delta: number }
  vol_left: { m1: number; m2: number; delta: number }
  vol_right: { m1: number; m2: number; delta: number }
}

interface MemberRow {
  id: string; name: string; join_date?: string; position?: string
  bv?: number; reason?: string
  old_active?: boolean; new_active?: boolean
  old_position?: string; new_position?: string
}

interface CompareData {
  month1: string
  month2: string
  summary: SummaryDelta
  newMembers: MemberRow[]
  lostMembers: MemberRow[]
  activeChanged: MemberRow[]
  positionChanged: MemberRow[]
  volumeChart: { label: string; m1Left: number; m1Right: number; m2Left: number; m2Right: number }[]
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-slate-500">-</span>
  return (
    <span className={delta > 0 ? 'text-green-400' : 'text-red-400'}>
      {delta > 0 ? '+' : ''}{delta.toLocaleString()}
    </span>
  )
}

export default function ComparePage() {
  const [months, setMonths] = useState<string[]>([])
  const [month1, setMonth1] = useState('')
  const [month2, setMonth2] = useState('')
  const [data, setData] = useState<CompareData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/summary')
      .then((r) => r.json())
      .then((d) => {
        const m = d.months ?? []
        setMonths(m)
        if (m.length >= 2) {
          setMonth2(m[0])
          setMonth1(m[1])
        } else if (m.length === 1) {
          setMonth1(m[0])
          setMonth2(m[0])
        }
      })
  }, [])

  useEffect(() => {
    if (!month1 || !month2) return
    setLoading(true)
    fetch(`/api/compare?month1=${month1}&month2=${month2}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [month1, month2])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">เปรียบเทียบรายเดือน</h1>
          <p className="text-slate-400 text-sm mt-1">เปรียบเทียบข้อมูลระหว่าง 2 เดือน</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={month1}
            onChange={(e) => setMonth1(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {months.map((m) => <option key={m}>{m}</option>)}
          </select>
          <span className="text-slate-500">vs</span>
          <select
            value={month2}
            onChange={(e) => setMonth2(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {months.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {loading && <div className="text-slate-400 py-16 text-center">กำลังโหลด...</div>}

      {!loading && data && (
        <>
          {/* Summary delta cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'สมาชิกทั้งหมด', d: data.summary.total_members, color: 'text-brand-400' },
              { label: 'Active', d: data.summary.active_members, color: 'text-green-400' },
              { label: 'BV รวม', d: data.summary.total_bv, color: 'text-purple-400' },
              { label: 'Vol ซ้าย', d: data.summary.vol_left, color: 'text-sky-400' },
              { label: 'Vol ขวา', d: data.summary.vol_right, color: 'text-purple-400' },
            ].map(({ label, d, color }) => (
              <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1">{label}</p>
                <div className="flex items-baseline gap-2">
                  <span className={`text-xl font-bold ${color}`}>{d.m2.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs">
                  <span className="text-slate-500">{d.m1.toLocaleString()}</span>
                  <span className="text-slate-600">&rarr;</span>
                  <DeltaBadge delta={d.delta} />
                </div>
              </div>
            ))}
          </div>

          {/* Volume comparison chart */}
          {data.volumeChart && data.volumeChart.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-300 mb-4">Volume เปรียบเทียบ ซ้าย/ขวา</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.volumeChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                    formatter={(v: number) => v.toLocaleString()}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="m1Left" name={`${data.month1} ซ้าย`} fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="m1Right" name={`${data.month1} ขวา`} fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="m2Left" name={`${data.month2} ซ้าย`} fill="#38bdf8" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="m2Right" name={`${data.month2} ขวา`} fill="#a78bfa" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* New members table */}
          {data.newMembers && data.newMembers.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 className="text-sm font-semibold text-slate-300">
                  สมาชิกใหม่ ({data.newMembers.length} คน)
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-xs border-b border-slate-800">
                      <th className="text-left px-4 py-3">รหัส</th>
                      <th className="text-left px-4 py-3">ชื่อ</th>
                      <th className="text-left px-4 py-3">วันที่สมัคร</th>
                      <th className="text-left px-4 py-3">ตำแหน่ง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.newMembers.map((m) => (
                      <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="px-4 py-2.5 text-brand-400 font-mono text-xs">{m.id}</td>
                        <td className="px-4 py-2.5 text-slate-300">{m.name}</td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs">{m.join_date ?? '-'}</td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs">{m.position ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Lost members table */}
          {data.lostMembers && data.lostMembers.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 className="text-sm font-semibold text-slate-300">
                  สมาชิกที่หายไป ({data.lostMembers.length} คน)
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-xs border-b border-slate-800">
                      <th className="text-left px-4 py-3">รหัส</th>
                      <th className="text-left px-4 py-3">ชื่อ</th>
                      <th className="text-left px-4 py-3">เหตุผล</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lostMembers.map((m) => (
                      <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="px-4 py-2.5 text-brand-400 font-mono text-xs">{m.id}</td>
                        <td className="px-4 py-2.5 text-slate-300">{m.name}</td>
                        <td className="px-4 py-2.5 text-red-400 text-xs">{m.reason ?? 'ไม่มีในรายชื่อ'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Active status changed table */}
          {data.activeChanged && data.activeChanged.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 className="text-sm font-semibold text-slate-300">
                  เปลี่ยนสถานะ Active ({data.activeChanged.length} คน)
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-xs border-b border-slate-800">
                      <th className="text-left px-4 py-3">รหัส</th>
                      <th className="text-left px-4 py-3">ชื่อ</th>
                      <th className="text-center px-4 py-3">{data.month1}</th>
                      <th className="text-center px-4 py-3"></th>
                      <th className="text-center px-4 py-3">{data.month2}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activeChanged.map((m) => (
                      <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="px-4 py-2.5 text-brand-400 font-mono text-xs">{m.id}</td>
                        <td className="px-4 py-2.5 text-slate-300">{m.name}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={m.old_active ? 'text-green-400' : 'text-red-400'}>
                            {m.old_active ? '● Active' : '○ Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-slate-600">&rarr;</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={m.new_active ? 'text-green-400' : 'text-red-400'}>
                            {m.new_active ? '● Active' : '○ Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Position changed table */}
          {data.positionChanged && data.positionChanged.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 className="text-sm font-semibold text-slate-300">
                  เลื่อนตำแหน่ง ({data.positionChanged.length} คน)
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-xs border-b border-slate-800">
                      <th className="text-left px-4 py-3">รหัส</th>
                      <th className="text-left px-4 py-3">ชื่อ</th>
                      <th className="text-center px-4 py-3">{data.month1}</th>
                      <th className="text-center px-4 py-3"></th>
                      <th className="text-center px-4 py-3">{data.month2}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.positionChanged.map((m) => (
                      <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="px-4 py-2.5 text-brand-400 font-mono text-xs">{m.id}</td>
                        <td className="px-4 py-2.5 text-slate-300">{m.name}</td>
                        <td className="px-4 py-2.5 text-center text-slate-400">{m.old_position}</td>
                        <td className="px-4 py-2.5 text-center text-amber-400">&rarr;</td>
                        <td className="px-4 py-2.5 text-center text-amber-400 font-semibold">{m.new_position}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!data.newMembers?.length && !data.lostMembers?.length && !data.activeChanged?.length && !data.positionChanged?.length && (
            <div className="text-center py-12 text-slate-500">
              <p>ไม่มีการเปลี่ยนแปลงระหว่างเดือนที่เลือก</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
