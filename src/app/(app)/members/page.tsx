'use client'
import { useEffect, useState, useMemo } from 'react'
import type { MemberWithReport } from '@/lib/types'
import PositionBadge from '@/components/PositionBadge'
import Link from 'next/link'

export default function MembersPage() {
  const [months, setMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [members, setMembers] = useState<MemberWithReport[]>([])
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('ALL')
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/summary')
      .then((r) => r.json())
      .then((d) => {
        setMonths(d.months ?? [])
        if (d.months?.[0]) setSelectedMonth(d.months[0])
      })
  }, [])

  useEffect(() => {
    if (!selectedMonth) return
    setLoading(true)
    fetch(`/api/members?month=${selectedMonth}`)
      .then((r) => r.json())
      .then((d) => { setMembers(d.members ?? []); setLoading(false) })
  }, [selectedMonth])

  const filtered = useMemo(() => {
    return members.filter((m) => {
      const q = search.toLowerCase()
      const matchSearch = !q || m.id.includes(q) || m.name.toLowerCase().includes(q)
      const matchPos = posFilter === 'ALL' || m.report.highest_position === posFilter
      const matchActive = activeFilter === 'ALL'
        || (activeFilter === 'Y' && m.report.is_active)
        || (activeFilter === 'N' && !m.report.is_active)
      return matchSearch && matchPos && matchActive
    })
  }, [members, search, posFilter, activeFilter])

  const totalBv = useMemo(() => filtered.reduce((s, m) => s + m.report.monthly_bv, 0), [filtered])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">สมาชิก</h1>
        <div className="text-right text-sm">
          <span className="text-slate-400">{filtered.length} / {members.length} คน</span>
          {totalBv > 0 && (
            <p className="text-xs text-amber-400">BV รวม {totalBv.toLocaleString()}</p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          {months.map((m) => <option key={m}>{m}</option>)}
        </select>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหา รหัส / ชื่อ"
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white w-52 placeholder-slate-500"
        />

        <select
          value={posFilter}
          onChange={(e) => setPosFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="ALL">ทุกตำแหน่ง</option>
          {['FA','BR','ST','SV'].map((p) => <option key={p}>{p}</option>)}
        </select>

        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="ALL">Active ทั้งหมด</option>
          <option value="Y">Active</option>
          <option value="N">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs">
                <th className="text-left px-4 py-3">ชั้น</th>
                <th className="text-left px-4 py-3">รหัส / ชื่อ</th>
                <th className="text-left px-4 py-3">วันที่สมัคร</th>
                <th className="text-left px-4 py-3">ตำแหน่ง</th>
                <th className="text-center px-4 py-3">Active</th>
                <th className="text-center px-4 py-3">Qualified</th>
                <th className="text-right px-4 py-3">BV</th>
                <th className="text-right px-4 py-3">Vol ซ้าย</th>
                <th className="text-right px-4 py-3">Vol ขวา</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-10 text-slate-500">กำลังโหลด...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-slate-500">ไม่พบข้อมูล</td></tr>
              ) : filtered.map((m) => (
                <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-2.5 text-slate-400">{m.report.level}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/members/${m.id}`} className="hover:text-brand-400">
                      <span className="text-brand-400 font-mono">{m.id}</span>
                      <span className="text-slate-300 ml-2">{m.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{m.join_date}</td>
                  <td className="px-4 py-2.5">
                    <PositionBadge pos={m.report.highest_position} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={m.report.is_active ? 'text-green-400' : 'text-slate-600'}>
                      {m.report.is_active ? '●' : '○'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={m.report.is_qualified ? 'text-blue-400' : 'text-slate-600'}>
                      {m.report.is_qualified ? '●' : '○'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-white">{m.report.monthly_bv.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-sky-400">{m.report.total_vol_left.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-purple-400">{m.report.total_vol_right.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
