'use client'
import { useEffect, useState } from 'react'

interface GoalTarget {
  vol_left: number
  vol_right: number
  bv: number
  new_members: number
}

interface GoalProgress {
  vol_left: { target: number; current: number; pct: number }
  vol_right: { target: number; current: number; pct: number }
  bv: { target: number; current: number; pct: number }
  new_members: { target: number; current: number; pct: number }
}

interface GoalsData {
  month: string
  months: string[]
  targets: GoalTarget | null
  progress: GoalProgress | null
}

function ProgressRing({ pct, size = 100, label, value, target }: {
  pct: number; size?: number; label: string; value: number; target: number
}) {
  const radius = (size - 12) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(pct, 100) / 100) * circumference
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="#1e293b" strokeWidth="6"
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-white">{pct.toFixed(0)}%</span>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-2">{label}</p>
      <p className="text-xs text-slate-500">{value.toLocaleString()} / {target.toLocaleString()}</p>
    </div>
  )
}

export default function GoalsPage() {
  const [data, setData] = useState<GoalsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [form, setForm] = useState<GoalTarget>({ vol_left: 0, vol_right: 0, bv: 0, new_members: 0 })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  function fetchGoals(month?: string) {
    setLoading(true)
    const url = month ? `/api/goals?month=${month}` : '/api/goals'
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        if (d.month) setSelectedMonth(d.month)
        if (d.targets) {
          setForm(d.targets)
        } else {
          setForm({ vol_left: 0, vol_right: 0, bv: 0, new_members: 0 })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchGoals() }, [])

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, ...form }),
      })
      const d = await res.json()
      setSaveMsg(d.ok ? 'บันทึกสำเร็จ' : d.error ?? 'เกิดข้อผิดพลาด')
      if (d.ok) fetchGoals(selectedMonth)
    } catch {
      setSaveMsg('ไม่สามารถบันทึกได้')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-slate-400 py-16 text-center">กำลังโหลด...</div>

  const progress = data?.progress

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">ตั้งเป้าหมาย</h1>
          <p className="text-slate-400 text-sm mt-1">กำหนดเป้าและติดตามความคืบหน้า</p>
        </div>
        <select
          value={selectedMonth}
          onChange={(e) => { setSelectedMonth(e.target.value); fetchGoals(e.target.value) }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          {(data?.months ?? []).map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>

      {/* Progress rings */}
      {progress && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-6 text-center">ความคืบหน้าเดือน {selectedMonth}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 justify-items-center">
            <ProgressRing
              pct={progress.vol_left.pct}
              label="Vol ซ้าย"
              value={progress.vol_left.current}
              target={progress.vol_left.target}
            />
            <ProgressRing
              pct={progress.vol_right.pct}
              label="Vol ขวา"
              value={progress.vol_right.current}
              target={progress.vol_right.target}
            />
            <ProgressRing
              pct={progress.bv.pct}
              label="BV"
              value={progress.bv.current}
              target={progress.bv.target}
            />
            <ProgressRing
              pct={progress.new_members.pct}
              label="สมาชิกใหม่"
              value={progress.new_members.current}
              target={progress.new_members.target}
            />
          </div>

          {/* Progress bars alternative view */}
          <div className="mt-8 space-y-4">
            {[
              { label: 'Vol ซ้าย', ...progress.vol_left, color: 'bg-sky-500' },
              { label: 'Vol ขวา', ...progress.vol_right, color: 'bg-purple-500' },
              { label: 'BV', ...progress.bv, color: 'bg-amber-500' },
              { label: 'สมาชิกใหม่', ...progress.new_members, color: 'bg-green-500' },
            ].map((item) => {
              const barColor = item.pct >= 80 ? 'bg-green-500' : item.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
              return (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{item.label}</span>
                    <span className="text-slate-300">
                      {item.current.toLocaleString()} / {item.target.toLocaleString()}
                      <span className={`ml-2 ${item.pct >= 80 ? 'text-green-400' : item.pct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                        ({item.pct.toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                      style={{ width: `${Math.min(item.pct, 100)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Goal setting form */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">ตั้งเป้าหมายเดือน {selectedMonth}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Vol ซ้าย</label>
            <input
              type="number"
              value={form.vol_left || ''}
              onChange={(e) => setForm({ ...form, vol_left: Number(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Vol ขวา</label>
            <input
              type="number"
              value={form.vol_right || ''}
              onChange={(e) => setForm({ ...form, vol_right: Number(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">BV</label>
            <input
              type="number"
              value={form.bv || ''}
              onChange={(e) => setForm({ ...form, bv: Number(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">สมาชิกใหม่</label>
            <input
              type="number"
              value={form.new_members || ''}
              onChange={(e) => setForm({ ...form, new_members: Number(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
              placeholder="0"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-brand-500 hover:bg-brand-600 disabled:bg-slate-700 text-white text-sm px-6 py-2 rounded-lg transition-colors font-medium"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกเป้าหมาย'}
          </button>
          {saveMsg && (
            <span className={`text-xs ${saveMsg === 'บันทึกสำเร็จ' ? 'text-green-400' : 'text-red-400'}`}>
              {saveMsg}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
