'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

const LOGIN_TIMEOUT_MS = 12_000

export default function LoginPage() {
  const router = useRouter()
  const [memberId, setMemberId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setStatus('กำลังตรวจสอบรหัสสมาชิกและรหัสผ่าน...')
    setLoading(true)

    const controller = new AbortController()
    const slowTimer = window.setTimeout(() => {
      setStatus('กำลังตรวจสอบข้อมูลสมาชิก กรุณารอสักครู่...')
    }, 3_000)
    const verySlowTimer = window.setTimeout(() => {
      setStatus('ระบบตอบสนองช้ากว่าปกติ แต่ยังพยายามเชื่อมต่ออยู่...')
    }, 7_000)
    const timeoutTimer = window.setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS)
    let succeeded = false

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: memberId.trim(), password }),
        signal: controller.signal,
      })

      const data = await res.json().catch(() => ({})) as {
        error?: string
        isAdmin?: boolean
      }

      if (!res.ok) {
        setError(data.error ?? 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่')
        return
      }

      succeeded = true
      setStatus('เข้าสู่ระบบสำเร็จ กำลังเปิด Dashboard...')
      router.replace(data.isAdmin ? '/' : '/my')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('ระบบใช้เวลาตอบสนองเกิน 12 วินาที กรุณากดเข้าสู่ระบบอีกครั้ง')
      } else {
        setError('เชื่อมต่อระบบเข้าสู่ระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')
      }
    } finally {
      window.clearTimeout(slowTimer)
      window.clearTimeout(verySlowTimer)
      window.clearTimeout(timeoutTimer)
      if (!succeeded) {
        setLoading(false)
        setStatus('')
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo area */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 mb-4">
            <span className="text-white font-bold text-xl">First Community</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Downline Analyzer</h1>
          <p className="text-slate-400 text-sm mt-1">เข้าสู่ระบบด้วยรหัสสมาชิก</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">รหัสสมาชิก</label>
            <input
              type="text"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="เช่น 900xxx"
              required
              disabled={loading}
              autoComplete="username"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-brand-500 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="รหัสผ่านเริ่มต้น = รหัสสมาชิก"
              required
              disabled={loading}
              autoComplete="current-password"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-brand-500 disabled:opacity-60"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="text-red-300 text-sm bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2.5"
            >
              <p>{error}</p>
              <p className="text-red-400/80 text-xs mt-1">ตรวจสอบรหัสแล้วกด “เข้าสู่ระบบ” อีกครั้งได้ทันที</p>
            </div>
          )}

          {loading && status && (
            <div
              aria-live="polite"
              className="text-sky-300 text-xs bg-sky-950/40 border border-sky-900/60 rounded-lg px-3 py-2"
            >
              {status}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-wait text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <p className="text-center text-slate-600 text-xs mt-4">
          รหัสผ่านเริ่มต้น = รหัสสมาชิกของท่าน
        </p>
      </div>
    </div>
  )
}
