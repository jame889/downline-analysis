'use client'
import { useEffect, useState } from 'react'

interface WatchMember {
  id: string
  name: string
  reason: string
  bv_trend: number[]
  upline_id: string | null
  upline_name: string | null
  months_inactive?: number
  last_active_month?: string
  recovered_month?: string
}

interface WatchlistData {
  atRisk: WatchMember[]
  lost: WatchMember[]
  recovered: WatchMember[]
}

type Tab = 'atRisk' | 'lost' | 'recovered'

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  if (!values || values.length === 0) return null
  const max = Math.max(...values, 1)
  const h = 24
  const w = values.length * 12
  const points = values.map((v, i) => `${i * 12 + 6},${h - (v / max) * (h - 4) - 2}`).join(' ')
  return (
    <svg width={w} height={h} className="inline-block">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
      {values.map((v, i) => (
        <circle key={i} cx={i * 12 + 6} cy={h - (v / max) * (h - 4) - 2} r="2" fill={color} />
      ))}
    </svg>
  )
}

function WatchCard({ member, variant }: { member: WatchMember; variant: Tab }) {
  const borderColor = {
    atRisk: 'border-red-700/50 bg-red-900/10',
    lost: 'border-slate-700 bg-slate-800/30',
    recovered: 'border-green-700/50 bg-green-900/10',
  }[variant]

  const sparkColor = {
    atRisk: '#ef4444',
    lost: '#64748b',
    recovered: '#22c55e',
  }[variant]

  return (
    <div className={`border ${borderColor} rounded-xl p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-brand-400 font-mono text-xs">{member.id}</span>
            <span className="text-slate-300 text-sm truncate">{member.name}</span>
          </div>
          <p className="text-xs text-slate-400 mb-2">{member.reason}</p>
          {member.upline_id && (
            <p className="text-xs text-slate-500">
              Upline: <span className="text-slate-400">{member.upline_name ?? member.upline_id}</span>
            </p>
          )}
          {member.months_inactive != null && (
            <p className="text-xs text-slate-500 mt-0.5">
              Inactive {member.months_inactive} เดือน
            </p>
          )}
          {member.last_active_month && (
            <p className="text-xs text-slate-500 mt-0.5">
              Active ล่าสุด: {member.last_active_month}
            </p>
          )}
          {member.recovered_month && (
            <p className="text-xs text-green-500 mt-0.5">
              กลับมา: {member.recovered_month}
            </p>
          )}
        </div>
        <div className="shrink-0">
          {member.bv_trend && member.bv_trend.length > 0 && (
            <div className="text-right">
              <MiniSparkline values={member.bv_trend} color={sparkColor} />
              <p className="text-xs text-slate-500 mt-0.5">BV trend</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function WatchlistPage() {
  const [data, setData] = useState<WatchlistData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('atRisk')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/watchlist')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function sendTelegram() {
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'watchlist' }),
      })
      const d = await res.json()
      setSendResult(d.ok ? 'ส่งสำเร็จ' : d.error ?? 'เกิดข้อผิดพลาด')
    } catch {
      setSendResult('ไม่สามารถเชื่อมต่อได้')
    } finally {
      setSending(false)
    }
  }

  if (loading) return <div className="text-slate-400 py-16 text-center">กำลังโหลด...</div>
  if (!data) return <div className="text-slate-400 py-16 text-center">ไม่พบข้อมูล</div>

  const tabs: { key: Tab; label: string; count: number; color: string }[] = [
    { key: 'atRisk', label: 'เสี่ยงหลุด', count: data.atRisk?.length ?? 0, color: 'text-red-400 border-red-500' },
    { key: 'lost', label: 'หายไปแล้ว', count: data.lost?.length ?? 0, color: 'text-slate-400 border-slate-500' },
    { key: 'recovered', label: 'กลับมาแล้ว', count: data.recovered?.length ?? 0, color: 'text-green-400 border-green-500' },
  ]

  const currentList = data[tab] ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Watch List</h1>
          <p className="text-slate-400 text-sm mt-1">สมาชิกที่ต้องจับตา</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={sendTelegram}
            disabled={sending}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {sending ? 'กำลังส่ง...' : 'ส่งแจ้งเตือน Telegram'}
          </button>
          {sendResult && (
            <span className={`text-xs ${sendResult === 'ส่งสำเร็จ' ? 'text-green-400' : 'text-red-400'}`}>
              {sendResult}
            </span>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4 text-center">
          <p className="text-xs text-red-400 mb-1">เสี่ยงหลุด</p>
          <p className="text-3xl font-bold text-red-400">{data.atRisk?.length ?? 0}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">หายไปแล้ว</p>
          <p className="text-3xl font-bold text-slate-400">{data.lost?.length ?? 0}</p>
        </div>
        <div className="bg-green-900/20 border border-green-700/50 rounded-xl p-4 text-center">
          <p className="text-xs text-green-400 mb-1">กลับมาแล้ว</p>
          <p className="text-3xl font-bold text-green-400">{data.recovered?.length ?? 0}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? t.color
                : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Cards */}
      {currentList.length === 0 ? (
        <div className="text-center py-12 text-slate-500">ไม่มีรายการ</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {currentList.map((m) => (
            <WatchCard key={m.id} member={m} variant={tab} />
          ))}
        </div>
      )}
    </div>
  )
}
