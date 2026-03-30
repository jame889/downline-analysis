'use client'
import { useEffect, useState } from 'react'

interface LeaderEntry {
  rank: number
  id: string
  name: string
  value: number
  formatted_value?: string
}

interface LeaderboardData {
  month: string
  topBV: LeaderEntry[]
  topRecruits: LeaderEntry[]
  topGrowth: LeaderEntry[]
  topPositionRise: LeaderEntry[]
}

function MedalIcon({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl">&#x1F947;</span>
  if (rank === 2) return <span className="text-xl">&#x1F948;</span>
  if (rank === 3) return <span className="text-xl">&#x1F949;</span>
  return <span className="text-sm text-slate-500 font-mono w-6 text-center inline-block">{rank}</span>
}

function Podium({ entries }: { entries: LeaderEntry[] }) {
  const top3 = entries.slice(0, 3)
  // Reorder for podium: [2nd, 1st, 3rd]
  const podiumOrder = top3.length >= 3
    ? [top3[1], top3[0], top3[2]]
    : top3

  const heights = top3.length >= 3 ? [80, 110, 60] : top3.length === 2 ? [110, 80] : [110]
  const bgColors = top3.length >= 3
    ? ['bg-slate-500/20', 'bg-amber-500/20', 'bg-amber-800/20']
    : top3.length === 2
      ? ['bg-amber-500/20', 'bg-slate-500/20']
      : ['bg-amber-500/20']

  return (
    <div className="flex items-end justify-center gap-2 mb-4">
      {podiumOrder.map((entry, i) => (
        <div key={entry.id} className="flex flex-col items-center">
          <p className="text-xs text-slate-400 truncate max-w-[80px] mb-1">{entry.name.split(' ')[0]}</p>
          <p className="text-xs text-brand-400 font-mono mb-1">{entry.id}</p>
          <div
            className={`${bgColors[i]} border border-slate-700 rounded-t-lg w-20 flex flex-col items-center justify-end pb-2`}
            style={{ height: heights[i] }}
          >
            <MedalIcon rank={entry.rank} />
            <p className="text-sm font-bold text-white mt-1">{entry.formatted_value ?? entry.value.toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function LeaderSection({ title, entries, valueLabel }: { title: string; entries: LeaderEntry[]; valueLabel: string }) {
  if (!entries || entries.length === 0) return null

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-slate-300 mb-4">{title}</h2>

      {/* Podium for top 3 */}
      {entries.length >= 1 && <Podium entries={entries} />}

      {/* Table for all */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs border-b border-slate-800">
              <th className="text-left px-3 py-2 w-12">อันดับ</th>
              <th className="text-left px-3 py-2">รหัส / ชื่อ</th>
              <th className="text-right px-3 py-2">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="px-3 py-2">
                  <MedalIcon rank={e.rank} />
                </td>
                <td className="px-3 py-2">
                  <span className="text-brand-400 font-mono text-xs">{e.id}</span>
                  <span className="text-slate-300 ml-2">{e.name}</span>
                </td>
                <td className="px-3 py-2 text-right text-white font-medium">
                  {e.formatted_value ?? e.value.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function LeaderboardPage() {
  const [months, setMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/summary')
      .then((r) => r.json())
      .then((d) => {
        const m = d.months ?? []
        setMonths(m)
        if (m[0]) setSelectedMonth(m[0])
      })
  }, [])

  useEffect(() => {
    if (!selectedMonth) return
    setLoading(true)
    fetch(`/api/leaderboard?month=${selectedMonth}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedMonth])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
          <p className="text-slate-400 text-sm mt-1">อันดับสมาชิกเด่นประจำเดือน</p>
        </div>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          {months.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>

      {loading && <div className="text-slate-400 py-16 text-center">กำลังโหลด...</div>}

      {!loading && data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LeaderSection title="BV สูงสุด" entries={data.topBV} valueLabel="BV" />
          <LeaderSection title="ชวนคนเก่ง" entries={data.topRecruits} valueLabel="คน" />
          <LeaderSection title="โตเร็วสุด" entries={data.topGrowth} valueLabel="Growth %" />
          <LeaderSection title="เลื่อนขั้นเร็ว" entries={data.topPositionRise} valueLabel="ตำแหน่ง" />
        </div>
      )}

      {!loading && !data && (
        <div className="text-center py-16 text-slate-500">ไม่พบข้อมูล</div>
      )}
    </div>
  )
}
