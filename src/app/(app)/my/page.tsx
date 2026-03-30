'use client'
import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import PositionBadge from '@/components/PositionBadge'
import VolLRChart from '@/components/VolLRChart'
import Link from 'next/link'

interface HistoryRow {
  month: string
  level: number
  highest_position: string
  is_active: boolean
  is_qualified: boolean
  monthly_bv: number
  monthly_thb: number
  total_vol_left: number
  total_vol_right: number
  vol_left_thb: number
  vol_right_thb: number
  weak_leg_bv: number
  weak_leg_thb: number
}

interface DownlineRow {
  id: string
  name: string
  join_date: string
  position: string
  is_active: boolean
  is_qualified: boolean
  monthly_bv: number
  monthly_thb: number
  total_vol_left: number
  total_vol_right: number
  level: number
}

interface Report {
  highest_position: string
  income_position: string
  is_active: boolean
  is_qualified: boolean
  monthly_bv: number
  monthly_thb: number
  total_vol_left: number
  total_vol_right: number
  vol_left_thb: number
  vol_right_thb: number
  weak_leg_bv: number
  weak_leg_thb: number
  level: number
}

interface Member { id: string; name: string; join_date: string; lv: number }

interface OrgStats { total: number; active: number; qualified: number; total_bv: number }

export default function MyPage() {
  const [months, setMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [member, setMember] = useState<Member | null>(null)
  const [myReport, setMyReport] = useState<Report | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [directDownlines, setDirectDownlines] = useState<DownlineRow[]>([])
  const [orgStats, setOrgStats] = useState<OrgStats | null>(null)
  const [loading, setLoading] = useState(true)

  function fetchData(month: string) {
    setLoading(true)
    fetch(`/api/my?month=${month}`)
      .then((r) => r.json())
      .then((d) => {
        setMember(d.member)
        setMyReport(d.myReport)
        setHistory(d.history ?? [])
        setDirectDownlines(d.directDownlines ?? [])
        setOrgStats(d.orgStats)
        if (!selectedMonth) setMonths(d.months ?? [])
        setLoading(false)
      })
  }

  useEffect(() => {
    fetch('/api/my')
      .then((r) => r.json())
      .then((d) => {
        setMember(d.member)
        setMyReport(d.myReport)
        setHistory(d.history ?? [])
        setDirectDownlines(d.directDownlines ?? [])
        setOrgStats(d.orgStats)
        setMonths(d.months ?? [])
        setSelectedMonth(d.month ?? '')
        setLoading(false)
      })
  }, [])

  const lrChartData = history.map((r) => ({
    month: r.month.slice(2),
    left: r.total_vol_left,
    right: r.total_vol_right,
  }))

  const bvChartData = history.map((r) => ({
    month: r.month.slice(2),
    BV: r.monthly_bv,
    'มูลค่า (฿)': r.monthly_thb,
    'Weak Leg': r.weak_leg_bv,
  }))

  if (loading) return <div className="text-slate-400 py-16 text-center">กำลังโหลด...</div>

  const leftPct = myReport && (myReport.total_vol_left + myReport.total_vol_right) > 0
    ? (myReport.total_vol_left / (myReport.total_vol_left + myReport.total_vol_right) * 100).toFixed(1)
    : '0'
  const rightPct = myReport && (myReport.total_vol_left + myReport.total_vol_right) > 0
    ? (myReport.total_vol_right / (myReport.total_vol_left + myReport.total_vol_right) * 100).toFixed(1)
    : '0'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {member?.name ?? '—'}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {member?.id} · สมัคร {member?.join_date} · LV {member?.lv?.toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {myReport && <PositionBadge pos={myReport.highest_position} />}
          <select
            value={selectedMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); fetchData(e.target.value) }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {months.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Top stats */}
      {myReport && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">BV เดือนนี้</p>
            <p className="text-2xl font-bold text-brand-400">{myReport.monthly_bv.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">฿{myReport.monthly_thb.toLocaleString()}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">สถานะ</p>
            <p className="font-medium text-sm mt-1">
              <span className={myReport.is_active ? 'text-green-400' : 'text-slate-500'}>
                {myReport.is_active ? '● Active' : '○ Inactive'}
              </span>
              <span className="text-slate-600 mx-1.5">·</span>
              <span className={myReport.is_qualified ? 'text-blue-400' : 'text-slate-500'}>
                {myReport.is_qualified ? 'Qualified' : 'Unqualified'}
              </span>
            </p>
          </div>

          {/* Left leg */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Vol สะสม ซ้าย ({leftPct}%)</p>
            <p className="text-2xl font-bold text-sky-400">{myReport.total_vol_left.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">฿{myReport.vol_left_thb.toLocaleString()}</p>
          </div>

          {/* Right leg */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Vol สะสม ขวา ({rightPct}%)</p>
            <p className="text-2xl font-bold text-purple-400">{myReport.total_vol_right.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">฿{myReport.vol_right_thb.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Weak leg + org stats row */}
      {myReport && orgStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4">
            <p className="text-xs text-amber-400 mb-1">Weak Leg (สาขาที่น้อยกว่า)</p>
            <p className="text-2xl font-bold text-amber-400">{myReport.weak_leg_bv.toLocaleString()}</p>
            <p className="text-xs text-amber-700 mt-1">฿{myReport.weak_leg_thb.toLocaleString()}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">สมาชิกในองค์กร</p>
            <p className="text-2xl font-bold text-white">{orgStats.total}</p>
            <p className="text-xs text-green-500 mt-1">Active {orgStats.active}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Downline โดยตรง</p>
            <p className="text-2xl font-bold text-white">{directDownlines.length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">BV รวมองค์กร</p>
            <p className="text-2xl font-bold text-purple-400">{orgStats.total_bv.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">฿{(orgStats.total_bv * 50).toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* L/R balance bar */}
      {myReport && (myReport.total_vol_left + myReport.total_vol_right) > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs text-slate-400 mb-3">สัดส่วน Vol ซ้าย / ขวา (สะสม)</p>
          <div className="flex rounded-full overflow-hidden h-5">
            <div
              className="bg-sky-500 flex items-center justify-center text-xs text-white font-medium"
              style={{ width: `${leftPct}%` }}
            >
              {Number(leftPct) > 10 ? `${leftPct}%` : ''}
            </div>
            <div
              className="bg-purple-500 flex items-center justify-center text-xs text-white font-medium"
              style={{ width: `${rightPct}%` }}
            >
              {Number(rightPct) > 10 ? `${rightPct}%` : ''}
            </div>
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1.5">
            <span className="text-sky-400">ซ้าย {myReport.total_vol_left.toLocaleString()} BV</span>
            <span className="text-purple-400">ขวา {myReport.total_vol_right.toLocaleString()} BV</span>
          </div>
        </div>
      )}

      {/* Charts */}
      {lrChartData.length > 1 && (
        <div className="grid md:grid-cols-2 gap-4">
          <VolLRChart data={lrChartData} title="Vol สะสม ซ้าย / ขวา รายเดือน" />

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">BV และมูลค่า (฿) รายเดือน</h2>
            <ResponsiveContainer width="100%" height={260}>
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
                <Line type="monotone" dataKey="Weak Leg" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Direct downlines */}
      {directDownlines.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-300">Downline โดยตรง ({directDownlines.length} คน)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs border-b border-slate-800">
                  <th className="text-left px-4 py-3">รหัส / ชื่อ</th>
                  <th className="text-left px-4 py-3">วันที่สมัคร</th>
                  <th className="text-left px-4 py-3">ตำแหน่ง</th>
                  <th className="text-center px-4 py-3">Active</th>
                  <th className="text-right px-4 py-3">BV</th>
                  <th className="text-right px-4 py-3">มูลค่า (฿)</th>
                  <th className="text-right px-4 py-3">Vol ซ้าย</th>
                  <th className="text-right px-4 py-3">Vol ขวา</th>
                </tr>
              </thead>
              <tbody>
                {directDownlines.map((d) => (
                  <tr key={d.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-4 py-2.5">
                      <Link href={`/members/${d.id}`} className="hover:text-brand-400">
                        <span className="text-brand-400 font-mono text-xs">{d.id}</span>
                        <span className="text-slate-300 ml-2">{d.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{d.join_date}</td>
                    <td className="px-4 py-2.5"><PositionBadge pos={d.position} /></td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={d.is_active ? 'text-green-400' : 'text-slate-600'}>
                        {d.is_active ? '●' : '○'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-white">{d.monthly_bv.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-amber-400">฿{d.monthly_thb.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-sky-400">{d.total_vol_left.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-purple-400">{d.total_vol_right.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* History table */}
      {history.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-300">ประวัติรายเดือน</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
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
                    <td className="px-4 py-2 text-right text-amber-400">฿{r.monthly_thb.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-sky-400">{r.total_vol_left.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-sky-700">฿{r.vol_left_thb.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-purple-400">{r.total_vol_right.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-purple-700">฿{r.vol_right_thb.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-amber-500">{r.weak_leg_bv.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-center">
        <Link href={`/tree?member=${member?.id}`} className="text-brand-400 text-sm hover:underline">
          ดูโครงสร้างองค์กร →
        </Link>
      </div>
    </div>
  )
}
