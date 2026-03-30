'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import type { Member, MonthlyReport } from '@/lib/types'
import PositionBadge from '@/components/PositionBadge'
import VolLRChart from '@/components/VolLRChart'
import Link from 'next/link'

const BV_TO_THB = 25000 / 500  // 50 ฿ per BV

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [member, setMember] = useState<Member | null>(null)
  const [history, setHistory] = useState<MonthlyReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/monthly?id=${id}`)
      .then((r) => r.json())
      .then((d) => { setMember(d.member); setHistory(d.history ?? []); setLoading(false) })
  }, [id])

  if (loading) return <div className="text-slate-400 py-12 text-center">กำลังโหลด...</div>
  if (!member) return <div className="text-slate-400 py-12 text-center">ไม่พบสมาชิก</div>

  const lrChartData = history.map((r) => ({
    month: r.month.slice(2),
    left: r.total_vol_left,
    right: r.total_vol_right,
  }))

  const bvChartData = history.map((r) => ({
    month: r.month.slice(2),
    BV: r.monthly_bv,
    'มูลค่า (฿)': r.monthly_bv * BV_TO_THB,
  }))

  const latest = history[history.length - 1]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/members" className="text-slate-400 hover:text-white text-sm">← กลับ</Link>
        <div>
          <h1 className="text-2xl font-bold text-white">
            <span className="text-brand-400 font-mono">{member.id}</span>
            <span className="ml-3">{member.name}</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">สมัคร: {member.join_date} · {member.country} · LV {member.lv?.toLocaleString()}</p>
        </div>
      </div>

      {/* Latest snapshot */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">ตำแหน่งล่าสุด</p>
            <PositionBadge pos={latest.highest_position} />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">BV เดือนล่าสุด</p>
            <p className="text-xl font-bold text-white">{latest.monthly_bv.toLocaleString()}</p>
            <p className="text-xs text-amber-400 mt-0.5">฿{(latest.monthly_bv * BV_TO_THB).toLocaleString()}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Vol สะสม ซ้าย</p>
            <p className="text-xl font-bold text-sky-400">{latest.total_vol_left.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">฿{(latest.total_vol_left * BV_TO_THB).toLocaleString()}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Vol สะสม ขวา</p>
            <p className="text-xl font-bold text-purple-400">{latest.total_vol_right.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">฿{(latest.total_vol_right * BV_TO_THB).toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Weak leg callout */}
      {latest && (latest.total_vol_left + latest.total_vol_right) > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4">
            <p className="text-xs text-amber-400 mb-1">Weak Leg (สาขาที่น้อยกว่า)</p>
            <p className="text-xl font-bold text-amber-400">
              {Math.min(latest.total_vol_left, latest.total_vol_right).toLocaleString()} BV
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              ฿{(Math.min(latest.total_vol_left, latest.total_vol_right) * BV_TO_THB).toLocaleString()}
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Vol เดือนนี้ ซ้าย / ขวา</p>
            <p className="text-lg font-bold">
              <span className="text-sky-400">{(latest.current_month_vol_left ?? 0).toLocaleString()}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span className="text-purple-400">{(latest.current_month_vol_right ?? 0).toLocaleString()}</span>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">เดือนปัจจุบัน</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Status</p>
            <p className="font-medium text-sm mt-1">
              <span className={latest.is_active ? 'text-green-400' : 'text-slate-500'}>
                {latest.is_active ? '● Active' : '○ Inactive'}
              </span>
              <span className="text-slate-600 mx-1.5">·</span>
              <span className={latest.is_qualified ? 'text-blue-400' : 'text-slate-500'}>
                {latest.is_qualified ? 'Qualified' : 'Unqualified'}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Charts */}
      {lrChartData.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <VolLRChart data={lrChartData} title="Vol สะสม ซ้าย / ขวา รายเดือน" />

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">BV และมูลค่า (฿) รายเดือน</h2>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={bvChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                  formatter={(v: number) => v.toLocaleString()}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="BV" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="มูลค่า (฿)" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* History table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="text-left px-4 py-3">เดือน</th>
                <th className="text-left px-4 py-3">ตำแหน่ง</th>
                <th className="text-center px-4 py-3">Active</th>
                <th className="text-right px-4 py-3">BV</th>
                <th className="text-right px-4 py-3">มูลค่า (฿)</th>
                <th className="text-right px-4 py-3">Vol ซ้าย</th>
                <th className="text-right px-4 py-3">฿ ซ้าย</th>
                <th className="text-right px-4 py-3">Vol ขวา</th>
                <th className="text-right px-4 py-3">฿ ขวา</th>
                <th className="text-right px-4 py-3">Weak Leg</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((r) => (
                <tr key={r.month} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                  <td className="px-4 py-2 text-slate-300">{r.month}</td>
                  <td className="px-4 py-2"><PositionBadge pos={r.highest_position} /></td>
                  <td className="px-4 py-2 text-center">
                    <span className={r.is_active ? 'text-green-400' : 'text-slate-600'}>{r.is_active ? '●' : '○'}</span>
                  </td>
                  <td className="px-4 py-2 text-right text-white">{r.monthly_bv}</td>
                  <td className="px-4 py-2 text-right text-amber-400">฿{(r.monthly_bv * BV_TO_THB).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-sky-400">{r.total_vol_left.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-sky-700">฿{(r.total_vol_left * BV_TO_THB).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-purple-400">{r.total_vol_right.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-purple-700">฿{(r.total_vol_right * BV_TO_THB).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-amber-500">
                    {Math.min(r.total_vol_left, r.total_vol_right).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
