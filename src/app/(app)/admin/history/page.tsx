'use client'

import { useState } from 'react'

interface SyncResult {
  ok: boolean
  members: number
  months: string[]
  counts: Record<string, number>
  storage: string
}

export default function HistorySyncPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState('')

  async function sync() {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const response = await fetch('/api/admin/sync-history', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Sync failed')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-amber-400">Data Administration</p>
        <h1 className="text-2xl font-bold text-white mt-2">ซิงก์ข้อมูลย้อนหลัง 9 เดือน</h1>
        <p className="text-sm text-slate-400 mt-2">นำข้อมูล Business Report ต.ค. 2025 – มิ.ย. 2026 ที่บรรจุมากับระบบ เข้า Supabase หรือฐานข้อมูล Local JSON</p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl bg-slate-950/60 p-4"><p className="text-xs text-slate-500">ช่วงข้อมูล</p><p className="font-semibold text-white mt-1">ต.ค. 2025 – มิ.ย. 2026</p></div>
          <div className="rounded-xl bg-slate-950/60 p-4"><p className="text-xs text-slate-500">จำนวนเดือน</p><p className="font-semibold text-white mt-1">9 เดือน</p></div>
          <div className="rounded-xl bg-slate-950/60 p-4"><p className="text-xs text-slate-500">โหมด</p><p className="font-semibold text-white mt-1">Upsert ปลอดภัย</p></div>
        </div>

        <button
          onClick={sync}
          disabled={loading}
          className="w-full rounded-xl bg-amber-500 px-5 py-3 font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'กำลังซิงก์ข้อมูล...' : 'ซิงก์ข้อมูลย้อนหลังเข้าฐานข้อมูล'}
        </button>

        {error && <p className="mt-4 rounded-xl border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
        {result && (
          <div className="mt-5 rounded-xl border border-green-800 bg-green-950/20 p-4">
            <p className="font-semibold text-green-300">ซิงก์สำเร็จ</p>
            <p className="text-sm text-slate-300 mt-2">สมาชิก {result.members.toLocaleString()} คน · {result.months.length} เดือน · บันทึกไปยัง {result.storage}</p>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {result.months.map((month) => <div key={month} className="rounded-lg bg-slate-950/50 p-2 text-center text-xs"><p className="text-slate-400">{month}</p><p className="font-semibold text-white mt-1">{result.counts[month]} คน</p></div>)}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-amber-800/40 bg-amber-950/10 p-5 text-sm text-slate-300 leading-relaxed">
        การซิงก์เป็นแบบ Upsert: ข้อมูลเดิมที่มี Primary Key เดียวกันจะถูกอัปเดต และข้อมูลเดือนใหม่จะถูกเพิ่ม โดยไม่ลบข้อมูลเดือนอื่นออกจากระบบ
      </div>
    </div>
  )
}
