'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface MyReport {
  highest_position: string
  monthly_bv: number
  total_vol_left: number
  total_vol_right: number
  is_active: number
}

interface Member {
  id: string
  name: string
  join_date: string
}

interface ApiData {
  member: Member | null
  myReport: MyReport | null
}

function EyeIcon({ show }: { show: boolean }) {
  if (show) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
      </svg>
    )
  }
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
}

function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-slate-400">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? ''}
          autoComplete="off"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 pr-10 focus:outline-none focus:border-brand-500 transition-colors"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <EyeIcon show={show} />
        </button>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [telegramConfigured, setTelegramConfigured] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pwResult, setPwResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/my')
      .then((r) => r.json())
      .then((d) => {
        setData({ member: d.member ?? null, myReport: d.myReport ?? null })
        setLoading(false)
      })
      .catch(() => setLoading(false))

    fetch('/api/telegram')
      .then((r) => r.json())
      .then((d) => setTelegramConfigured(d.configured))
      .catch(() => {})
  }, [])

  function validate(): string | null {
    if (!currentPassword) return 'กรุณากรอกรหัสผ่านปัจจุบัน'
    if (!newPassword) return 'กรุณากรอกรหัสผ่านใหม่'
    if (newPassword.length < 6) return 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร'
    if (newPassword === currentPassword) return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน'
    if (newPassword !== confirmPassword) return 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = validate()
    if (err) {
      setPwResult({ type: 'error', text: err })
      return
    }
    setSubmitting(true)
    setPwResult(null)
    try {
      const res = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const d = await res.json()
      if (res.ok && d.ok) {
        setPwResult({ type: 'success', text: 'เปลี่ยนรหัสผ่านสำเร็จแล้ว' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setPwResult({ type: 'error', text: d.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
      }
    } catch {
      setPwResult({ type: 'error', text: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' })
    } finally {
      setSubmitting(false)
    }
  }

  const member = data?.member
  const report = data?.myReport

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">โปรไฟล์</h1>
        <p className="text-slate-400 text-sm mt-1">ข้อมูลส่วนตัวและการตั้งค่าบัญชี</p>
      </div>

      {/* Profile Info Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <span>👤</span> ข้อมูลสมาชิก
        </h2>
        {loading ? (
          <p className="text-slate-500 text-sm">กำลังโหลด...</p>
        ) : member ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">รหัสสมาชิก</p>
                <p className="font-mono text-brand-400 font-bold text-lg">{member.id}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">วันที่สมัคร</p>
                <p className="text-white text-sm font-medium">
                  {member.join_date
                    ? new Date(member.join_date).toLocaleDateString('th-TH', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })
                    : '-'}
                </p>
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">ชื่อ-นามสกุล</p>
              <p className="text-white font-medium">{member.name}</p>
            </div>
            {report && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">ตำแหน่ง</p>
                  <p className="text-yellow-400 font-bold text-sm">{report.highest_position || '-'}</p>
                </div>
                <div className="bg-slate-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">BV เดือนนี้</p>
                  <p className="text-white font-bold">{report.monthly_bv.toLocaleString()}</p>
                </div>
                <div className="bg-slate-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">สถานะ</p>
                  <p className={report.is_active ? 'text-green-400 font-bold' : 'text-slate-500 font-bold'}>
                    {report.is_active ? 'Active' : 'Inactive'}
                  </p>
                </div>
              </div>
            )}
            {report && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Vol ซ้าย</p>
                  <p className="text-sky-400 font-bold">{report.total_vol_left.toLocaleString()}</p>
                </div>
                <div className="bg-slate-800 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Vol ขวา</p>
                  <p className="text-purple-400 font-bold">{report.total_vol_right.toLocaleString()}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-slate-500 text-sm">ไม่พบข้อมูลสมาชิก</p>
        )}
      </div>

      {/* Change Password Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <span>🔒</span> เปลี่ยนรหัสผ่าน
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordInput
            label="รหัสผ่านปัจจุบัน"
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder="กรอกรหัสผ่านปัจจุบัน"
          />
          <PasswordInput
            label="รหัสผ่านใหม่"
            value={newPassword}
            onChange={(v) => {
              setNewPassword(v)
              if (pwResult?.type === 'error') setPwResult(null)
            }}
            placeholder="อย่างน้อย 6 ตัวอักษร"
          />
          <PasswordInput
            label="ยืนยันรหัสผ่านใหม่"
            value={confirmPassword}
            onChange={(v) => {
              setConfirmPassword(v)
              if (pwResult?.type === 'error') setPwResult(null)
            }}
            placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
          />

          {/* Strength indicator */}
          {newPassword.length > 0 && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => {
                  const strength = newPassword.length >= 12 ? 4 : newPassword.length >= 8 ? 3 : newPassword.length >= 6 ? 2 : 1
                  return (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i <= strength
                          ? strength >= 4 ? 'bg-green-500' : strength >= 3 ? 'bg-yellow-500' : strength >= 2 ? 'bg-orange-500' : 'bg-red-500'
                          : 'bg-slate-700'
                      }`}
                    />
                  )
                })}
              </div>
              <p className="text-xs text-slate-500">
                {newPassword.length < 6 ? 'รหัสผ่านสั้นเกินไป' : newPassword.length < 8 ? 'ปานกลาง' : newPassword.length < 12 ? 'ดี' : 'แข็งแกร่ง'}
              </p>
            </div>
          )}

          {/* Confirm match indicator */}
          {confirmPassword.length > 0 && (
            <p className={`text-xs ${newPassword === confirmPassword ? 'text-green-400' : 'text-red-400'}`}>
              {newPassword === confirmPassword ? '✓ รหัสผ่านตรงกัน' : '✗ รหัสผ่านไม่ตรงกัน'}
            </p>
          )}

          {pwResult && (
            <div className={`text-sm px-3 py-2 rounded-lg ${
              pwResult.type === 'success'
                ? 'bg-green-900/30 border border-green-800 text-green-400'
                : 'bg-red-900/30 border border-red-800 text-red-400'
            }`}>
              {pwResult.text}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {submitting ? 'กำลังเปลี่ยน...' : 'เปลี่ยนรหัสผ่าน'}
          </button>
        </form>
      </div>

      {/* Telegram Link Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📱</span>
            <div>
              <h2 className="text-base font-semibold text-white">Telegram แจ้งเตือน</h2>
              <p className={`text-xs mt-0.5 ${telegramConfigured ? 'text-green-400' : 'text-slate-500'}`}>
                {telegramConfigured ? '✓ เชื่อมต่อแล้ว' : '✗ ยังไม่ได้ตั้งค่า'}
              </p>
            </div>
          </div>
          <Link
            href="/telegram"
            className="text-sm px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors"
          >
            ตั้งค่า →
          </Link>
        </div>
      </div>
    </div>
  )
}
