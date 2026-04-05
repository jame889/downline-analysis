'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import ExcelUpload from '@/components/ExcelUpload'

// ─── Types ───────────────────────────────────────────────────────────────────

interface User {
  id: string
  name: string
  join_date: string
  lv: number
  position: string
  is_active: boolean
  is_qualified: boolean
  monthly_bv: number
  isBlocked: boolean
  blockedAt?: string
  blockedReason?: string
  hasChangedPassword: boolean
  lastLogin: string | null
  loginCount: number
  lastIp: string | null
}

interface LoginEntry {
  memberId: string
  name: string
  timestamp: string
  ip: string
}

interface AdminData {
  users: User[]
  total: number
  month: string
}

interface ActivityData {
  recentLogins: LoginEntry[]
  sessions: Record<string, { lastLogin: string; loginCount: number; lastIp: string }>
  totalLogins: number
  uniqueUsers: number
}

type Tab = 'members' | 'activity' | 'security' | 'upload'
type ToastType = 'success' | 'error'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

function formatThaiDate(isoString: string | null): string {
  if (!isoString) return '-'
  try {
    const d = new Date(isoString)
    const day = d.getDate()
    const month = THAI_MONTHS[d.getMonth()]
    const year = d.getFullYear() + 543
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${day} ${month} ${year} ${hh}:${mm}`
  } catch {
    return isoString
  }
}

function formatThaiDateShort(isoString: string | null): string {
  if (!isoString) return '-'
  try {
    const d = new Date(isoString)
    const day = d.getDate()
    const month = THAI_MONTHS[d.getMonth()]
    const year = d.getFullYear() + 543
    return `${day} ${month} ${year}`
  } catch {
    return isoString
  }
}

function isToday(isoString: string | null): boolean {
  if (!isoString) return false
  const d = new Date(isoString)
  const now = new Date()
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  )
}

// ─── Loading Spinner ──────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastProps {
  msg: string
  type: ToastType
}

function Toast({ msg, type }: ToastProps) {
  return (
    <div
      className={`fixed top-4 right-4 z-50 max-w-sm px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all duration-300 ${
        type === 'success' ? 'bg-green-600' : 'bg-red-600'
      }`}
    >
      {type === 'success' ? '✓ ' : '✕ '}
      {msg}
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color = 'text-white',
}: {
  label: string
  value: number | string
  color?: string
}) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl border border-slate-700">
        <p className="text-white mb-6 text-sm leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm transition-colors"
          >
            ยกเลิก
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-sm font-medium transition-colors"
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Knowledge Base Component ─────────────────────────────────────────────────

interface KnowledgeDoc {
  id: string
  filename: string
  title: string
  size: number
  uploadedAt: string
}

function KnowledgeBase() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/knowledge')
    if (r.ok) {
      const d = await r.json()
      setDocs(d.docs ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function upload() {
    if (!file) return
    setUploading(true)
    setMsg(null)
    const form = new FormData()
    form.append('file', file)
    form.append('title', title || file.name.replace(/\.pdf$/i, ''))
    const r = await fetch('/api/admin/knowledge', { method: 'POST', body: form })
    const d = await r.json()
    if (r.ok) {
      setMsg({ text: `อัพโหลด "${d.title}" สำเร็จ (${(d.chars / 1000).toFixed(1)}k ตัวอักษร)`, ok: true })
      setFile(null)
      setTitle('')
      if (fileRef.current) fileRef.current.value = ''
      load()
    } else {
      setMsg({ text: d.error ?? 'เกิดข้อผิดพลาด', ok: false })
    }
    setUploading(false)
  }

  async function remove(id: string, name: string) {
    if (!confirm(`ลบ "${name}"?`)) return
    await fetch('/api/admin/knowledge', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }

  function fmt(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-white mb-1">🧠 ฐานความรู้ Coach JOE</h2>
        <p className="text-xs text-slate-500">อัพโหลด PDF เนื้อหาความรู้ด้านธุรกิจเครือข่าย Binary · Coach JOE จะใช้ข้อมูลนี้ตอบคำถามอัตโนมัติ</p>
      </div>

      {/* Upload form */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-300">เพิ่มเอกสารใหม่</p>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ชื่อเอกสาร (ไม่บังคับ)"
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
        />
        <div
          className="border-2 border-dashed border-slate-600 hover:border-brand-500 rounded-xl p-6 text-center cursor-pointer transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          {file ? (
            <div>
              <p className="text-sm text-white font-medium">📄 {file.name}</p>
              <p className="text-xs text-slate-400 mt-1">{fmt(file.size)}</p>
            </div>
          ) : (
            <div>
              <p className="text-slate-400 text-sm">คลิกเพื่อเลือกไฟล์ PDF</p>
              <p className="text-slate-500 text-xs mt-1">ขนาดสูงสุด 10 MB</p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {msg && (
          <p className={`text-xs ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>
            {msg.ok ? '✓ ' : '✕ '}{msg.text}
          </p>
        )}
        <button
          onClick={upload}
          disabled={!file || uploading}
          className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
        >
          {uploading ? 'กำลังประมวลผล...' : 'อัพโหลด PDF'}
        </button>
      </div>

      {/* Docs list */}
      <div>
        <p className="text-xs font-semibold text-slate-400 mb-3">เอกสารทั้งหมด ({docs.length})</p>
        {loading ? (
          <p className="text-xs text-slate-500 text-center py-4">กำลังโหลด...</p>
        ) : docs.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6">ยังไม่มีเอกสาร</p>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between bg-slate-800/40 border border-slate-700 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl">📄</span>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{d.title}</p>
                    <p className="text-xs text-slate-500">{d.filename} · {fmt(d.size)}</p>
                  </div>
                </div>
                <button
                  onClick={() => remove(d.id, d.title)}
                  className="ml-4 text-xs text-red-400 hover:text-red-300 shrink-0 transition-colors"
                >
                  ลบ
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('members')

  // Data
  const [adminData, setAdminData] = useState<AdminData | null>(null)
  const [activityData, setActivityData] = useState<ActivityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activityLoading, setActivityLoading] = useState(true)

  // Search
  const [search, setSearch] = useState('')
  const [filteredUsers, setFilteredUsers] = useState<User[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null)

  // Confirm dialog
  const [confirm, setConfirm] = useState<{
    message: string
    onConfirm: () => void
  } | null>(null)

  // ── Toast auto-dismiss ──
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(t)
    }
  }, [toast])

  // ── Auth check ──
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => {
        setIsAdmin(data?.session?.isAdmin === true)
      })
      .catch(() => setIsAdmin(false))
  }, [])

  // ── Fetch users ──
  const fetchUsers = useCallback(async (q?: string) => {
    try {
      const url = q ? `/api/admin/users?search=${encodeURIComponent(q)}` : '/api/admin/users'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed')
      const data: AdminData = await res.json()
      setAdminData(data)
      setFilteredUsers(data.users)
    } catch {
      setToast({ msg: 'โหลดข้อมูลสมาชิกล้มเหลว', type: 'error' })
    } finally {
      setLoading(false)
      setSearchLoading(false)
    }
  }, [])

  // ── Fetch activity ──
  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/activity')
      if (!res.ok) throw new Error('Failed')
      const data: ActivityData = await res.json()
      setActivityData(data)
    } catch {
      setToast({ msg: 'โหลดข้อมูลกิจกรรมล้มเหลว', type: 'error' })
    } finally {
      setActivityLoading(false)
    }
  }, [])

  // ── Initial fetch ──
  useEffect(() => {
    if (isAdmin === true) {
      fetchUsers()
      fetchActivity()
    }
  }, [isAdmin, fetchUsers, fetchActivity])

  // ── Debounced search ──
  useEffect(() => {
    if (!isAdmin) return
    setSearchLoading(true)
    const t = setTimeout(() => {
      fetchUsers(search)
    }, 400)
    return () => clearTimeout(t)
  }, [search, isAdmin, fetchUsers])

  // ── Block / Unblock ──
  const handleBlockToggle = (user: User) => {
    const action = user.isBlocked ? 'unblock' : 'block'
    const actionLabel = user.isBlocked ? 'ปลดบล็อก' : 'บล็อก'
    setConfirm({
      message: `ต้องการ${actionLabel}สมาชิก "${user.name}" (${user.id}) ใช่หรือไม่?`,
      onConfirm: async () => {
        setConfirm(null)
        try {
          const res = await fetch('/api/admin/block', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId: user.id, action }),
          })
          if (!res.ok) throw new Error('Failed')
          setToast({ msg: `${actionLabel}สมาชิก ${user.name} สำเร็จ`, type: 'success' })
          await fetchUsers(search)
        } catch {
          setToast({ msg: `${actionLabel}ล้มเหลว`, type: 'error' })
        }
      },
    })
  }

  // ── Reset password ──
  const handleResetPassword = (user: User) => {
    setConfirm({
      message: `ต้องการรีเซ็ตรหัสผ่านของ "${user.name}" (${user.id}) เป็นค่าเริ่มต้นใช่หรือไม่?`,
      onConfirm: async () => {
        setConfirm(null)
        try {
          const res = await fetch('/api/admin/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId: user.id }),
          })
          if (!res.ok) throw new Error('Failed')
          setToast({ msg: `รีเซ็ตรหัสผ่าน ${user.name} สำเร็จ`, type: 'success' })
          await fetchUsers(search)
        } catch {
          setToast({ msg: 'รีเซ็ตรหัสผ่านล้มเหลว', type: 'error' })
        }
      },
    })
  }

  // ── Bulk reset (all default passwords) ──
  const handleBulkReset = () => {
    if (!adminData) return
    const targets = adminData.users.filter((u) => !u.hasChangedPassword)
    setConfirm({
      message: `ต้องการรีเซ็ตรหัสผ่านทั้งหมด ${targets.length} คนที่ยังใช้รหัสเริ่มต้นใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`,
      onConfirm: async () => {
        setConfirm(null)
        let success = 0
        let fail = 0
        for (const user of targets) {
          try {
            const res = await fetch('/api/admin/reset-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ memberId: user.id }),
            })
            if (res.ok) success++
            else fail++
          } catch {
            fail++
          }
        }
        setToast({
          msg: `รีเซ็ตสำเร็จ ${success} คน${fail > 0 ? `, ล้มเหลว ${fail} คน` : ''}`,
          type: fail > 0 ? 'error' : 'success',
        })
        await fetchUsers(search)
      },
    })
  }

  // ── Guard: auth check ──
  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
        <span className="text-5xl">🔒</span>
        <h1 className="text-2xl font-bold text-white">ไม่มีสิทธิ์เข้าถึง</h1>
        <p className="text-slate-400 text-sm">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>
      </div>
    )
  }

  // ── Derived stats ──
  const users = adminData?.users ?? []
  const totalUsers = adminData?.total ?? users.length
  const activeUsers = users.filter((u) => u.is_active).length
  const blockedUsers = users.filter((u) => u.isBlocked).length
  const loggedInUsers = users.filter((u) => u.loginCount > 0).length
  const defaultPwUsers = users.filter((u) => !u.hasChangedPassword)
  const todayLogins = activityData?.recentLogins.filter((l) => isToday(l.timestamp)).length ?? 0

  // ── Tab definitions ──
  const tabs: { key: Tab; label: string }[] = [
    { key: 'members', label: 'สมาชิก' },
    { key: 'activity', label: 'การเข้าใช้งาน' },
    { key: 'security', label: 'ความปลอดภัย' },
    { key: 'upload', label: '📤 อัพโหลดข้อมูล' },
  ]

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Confirm Dialog */}
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
          <p className="text-slate-400 mt-1 text-sm">จัดการสมาชิก กิจกรรม และความปลอดภัยของระบบ</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800/60 p-1 rounded-xl w-fit mb-8 border border-slate-700">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === t.key
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ═══ TAB 1: สมาชิก ═══ */}
        {activeTab === 'members' && (
          <div className="space-y-6">
            {/* Search */}
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                🔍
              </span>
              <input
                type="text"
                placeholder="ค้นหาด้วยรหัสหรือชื่อสมาชิก..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              {searchLoading && (
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="สมาชิกทั้งหมด" value={totalUsers} color="text-blue-400" />
              <StatCard label="Active เดือนนี้" value={activeUsers} color="text-green-400" />
              <StatCard label="ถูกบล็อก" value={blockedUsers} color="text-red-400" />
              <StatCard label="เคยเข้าใช้งาน" value={loggedInUsers} color="text-purple-400" />
            </div>

            {/* Table */}
            {loading ? (
              <Spinner />
            ) : (
              <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 text-left font-medium">รหัส</th>
                        <th className="px-4 py-3 text-left font-medium">ชื่อ</th>
                        <th className="px-4 py-3 text-left font-medium hidden md:table-cell">ตำแหน่ง</th>
                        <th className="px-4 py-3 text-center font-medium hidden sm:table-cell">Active</th>
                        <th className="px-4 py-3 text-right font-medium hidden lg:table-cell">BV</th>
                        <th className="px-4 py-3 text-left font-medium hidden xl:table-cell">เข้าใช้ล่าสุด</th>
                        <th className="px-4 py-3 text-center font-medium hidden lg:table-cell">จำนวนครั้ง</th>
                        <th className="px-4 py-3 text-center font-medium hidden md:table-cell">รหัสผ่าน</th>
                        <th className="px-4 py-3 text-center font-medium">สถานะ</th>
                        <th className="px-4 py-3 text-center font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                            ไม่พบข้อมูลสมาชิก
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((user) => (
                          <tr
                            key={user.id}
                            className={`transition-colors ${
                              user.isBlocked
                                ? 'bg-red-950/30 hover:bg-red-950/50'
                                : 'hover:bg-slate-700/40'
                            }`}
                          >
                            <td className="px-4 py-3 font-mono text-slate-300 text-xs">{user.id}</td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-white">{user.name}</div>
                              <div className="text-xs text-slate-500">Lv.{user.lv}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-400 hidden md:table-cell text-xs">
                              {user.position}
                            </td>
                            <td className="px-4 py-3 text-center hidden sm:table-cell">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  user.is_active
                                    ? 'bg-green-900/50 text-green-400 border border-green-800'
                                    : 'bg-slate-700 text-slate-400 border border-slate-600'
                                }`}
                              >
                                {user.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-slate-300 hidden lg:table-cell font-mono text-xs">
                              {user.monthly_bv.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-slate-400 hidden xl:table-cell text-xs">
                              {formatThaiDate(user.lastLogin)}
                            </td>
                            <td className="px-4 py-3 text-center text-slate-300 hidden lg:table-cell">
                              {user.loginCount}
                            </td>
                            <td className="px-4 py-3 text-center hidden md:table-cell">
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  user.hasChangedPassword
                                    ? 'bg-green-900/50 text-green-400 border border-green-800'
                                    : 'bg-slate-700 text-slate-400 border border-slate-600'
                                }`}
                              >
                                {user.hasChangedPassword ? 'เปลี่ยนแล้ว' : 'ค่าเริ่มต้น'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {user.isBlocked ? (
                                <span className="text-xs text-red-400 font-medium">🚫 Blocked</span>
                              ) : (
                                <span className="text-xs text-green-400 font-medium">✓ Active</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 justify-center flex-wrap">
                                <button
                                  onClick={() => handleResetPassword(user)}
                                  className="px-2.5 py-1.5 bg-amber-700/40 hover:bg-amber-700/70 text-amber-300 border border-amber-700/50 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                                >
                                  🔑 Reset
                                </button>
                                <button
                                  onClick={() => handleBlockToggle(user)}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border whitespace-nowrap ${
                                    user.isBlocked
                                      ? 'bg-green-800/40 hover:bg-green-800/70 text-green-300 border-green-700/50'
                                      : 'bg-red-800/40 hover:bg-red-800/70 text-red-300 border-red-700/50'
                                  }`}
                                >
                                  {user.isBlocked ? '✓ Unblock' : '🚫 Block'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredUsers.length > 0 && (
                  <div className="px-4 py-3 bg-slate-900/30 border-t border-slate-700 text-xs text-slate-500">
                    แสดง {filteredUsers.length} จาก {totalUsers} สมาชิก
                    {adminData?.month && ` · ข้อมูลเดือน ${adminData.month}`}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB 2: การเข้าใช้งาน ═══ */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="ครั้งทั้งหมด"
                value={activityData?.totalLogins ?? '-'}
                color="text-blue-400"
              />
              <StatCard
                label="ผู้ใช้ไม่ซ้ำ"
                value={activityData?.uniqueUsers ?? '-'}
                color="text-purple-400"
              />
              <StatCard label="วันนี้" value={todayLogins} color="text-green-400" />
            </div>

            {/* Recent logins table */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                <h2 className="font-semibold text-white text-sm">ประวัติการเข้าใช้งานล่าสุด</h2>
                <span className="text-xs text-slate-500">50 รายการล่าสุด</span>
              </div>
              {activityLoading ? (
                <Spinner />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 text-left font-medium">#</th>
                        <th className="px-4 py-3 text-left font-medium">วันเวลา</th>
                        <th className="px-4 py-3 text-left font-medium">รหัส</th>
                        <th className="px-4 py-3 text-left font-medium">ชื่อ</th>
                        <th className="px-4 py-3 text-left font-medium hidden md:table-cell">IP Address</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {!activityData?.recentLogins.length ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                            ไม่มีข้อมูลการเข้าใช้งาน
                          </td>
                        </tr>
                      ) : (
                        activityData.recentLogins.map((entry, idx) => (
                          <tr
                            key={`${entry.memberId}-${entry.timestamp}-${idx}`}
                            className={`hover:bg-slate-700/40 transition-colors ${
                              isToday(entry.timestamp) ? 'bg-blue-950/20' : ''
                            }`}
                          >
                            <td className="px-4 py-3 text-slate-600 text-xs">{idx + 1}</td>
                            <td className="px-4 py-3 text-slate-300 text-xs whitespace-nowrap">
                              {formatThaiDate(entry.timestamp)}
                              {isToday(entry.timestamp) && (
                                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-900/50 text-blue-400 border border-blue-800">
                                  วันนี้
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-300 text-xs">{entry.memberId}</td>
                            <td className="px-4 py-3 text-white text-sm">{entry.name}</td>
                            <td className="px-4 py-3 font-mono text-slate-400 text-xs hidden md:table-cell">
                              {entry.ip}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB 3: ความปลอดภัย ═══ */}
        {activeTab === 'security' && (
          <div className="space-y-8">
            {/* Blocked users */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span>🚫</span>
                  สมาชิกที่ถูกบล็อก
                  <span className="ml-1 px-2 py-0.5 bg-red-900/50 text-red-400 border border-red-800 rounded-full text-xs">
                    {users.filter((u) => u.isBlocked).length}
                  </span>
                </h2>
              </div>
              {loading ? (
                <Spinner />
              ) : users.filter((u) => u.isBlocked).length === 0 ? (
                <div className="bg-slate-800 rounded-xl border border-slate-700 px-6 py-10 text-center">
                  <p className="text-slate-500 text-sm">ไม่มีสมาชิกที่ถูกบล็อก</p>
                </div>
              ) : (
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider">
                          <th className="px-4 py-3 text-left font-medium">รหัส</th>
                          <th className="px-4 py-3 text-left font-medium">ชื่อ</th>
                          <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">บล็อกเมื่อ</th>
                          <th className="px-4 py-3 text-left font-medium hidden md:table-cell">เหตุผล</th>
                          <th className="px-4 py-3 text-center font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {users
                          .filter((u) => u.isBlocked)
                          .map((user) => (
                            <tr key={user.id} className="bg-red-950/20 hover:bg-red-950/30 transition-colors">
                              <td className="px-4 py-3 font-mono text-slate-300 text-xs">{user.id}</td>
                              <td className="px-4 py-3 text-white font-medium">{user.name}</td>
                              <td className="px-4 py-3 text-slate-400 text-xs hidden sm:table-cell">
                                {formatThaiDateShort(user.blockedAt ?? null)}
                              </td>
                              <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">
                                {user.blockedReason ?? '-'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => handleBlockToggle(user)}
                                  className="px-3 py-1.5 bg-green-800/40 hover:bg-green-800/70 text-green-300 border border-green-700/50 rounded-lg text-xs font-medium transition-colors"
                                >
                                  ✓ Unblock
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* Default password users */}
            <section>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span>🔑</span>
                  สมาชิกที่ยังใช้รหัสผ่านเริ่มต้น
                  <span className="ml-1 px-2 py-0.5 bg-amber-900/50 text-amber-400 border border-amber-800 rounded-full text-xs">
                    {defaultPwUsers.length}
                  </span>
                </h2>
                {defaultPwUsers.length > 0 && (
                  <button
                    onClick={handleBulkReset}
                    className="px-4 py-2 bg-amber-700/40 hover:bg-amber-700/70 text-amber-300 border border-amber-700/50 rounded-lg text-sm font-medium transition-colors"
                  >
                    🔄 Reset ทั้งหมด ({defaultPwUsers.length})
                  </button>
                )}
              </div>
              {loading ? (
                <Spinner />
              ) : defaultPwUsers.length === 0 ? (
                <div className="bg-slate-800 rounded-xl border border-slate-700 px-6 py-10 text-center">
                  <p className="text-green-400 text-sm font-medium">✓ สมาชิกทุกคนได้เปลี่ยนรหัสผ่านแล้ว</p>
                </div>
              ) : (
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider">
                          <th className="px-4 py-3 text-left font-medium">รหัส</th>
                          <th className="px-4 py-3 text-left font-medium">ชื่อ</th>
                          <th className="px-4 py-3 text-center font-medium hidden sm:table-cell">จำนวนครั้งที่เข้าใช้</th>
                          <th className="px-4 py-3 text-left font-medium hidden md:table-cell">เข้าใช้ล่าสุด</th>
                          <th className="px-4 py-3 text-center font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {defaultPwUsers.map((user) => (
                          <tr key={user.id} className="hover:bg-slate-700/40 transition-colors">
                            <td className="px-4 py-3 font-mono text-slate-300 text-xs">{user.id}</td>
                            <td className="px-4 py-3 text-white font-medium">{user.name}</td>
                            <td className="px-4 py-3 text-center text-slate-300 hidden sm:table-cell">
                              {user.loginCount === 0 ? (
                                <span className="text-slate-500 text-xs">ยังไม่เคยเข้า</span>
                              ) : (
                                user.loginCount
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-400 text-xs hidden md:table-cell">
                              {formatThaiDate(user.lastLogin)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleResetPassword(user)}
                                className="px-3 py-1.5 bg-amber-700/40 hover:bg-amber-700/70 text-amber-300 border border-amber-700/50 rounded-lg text-xs font-medium transition-colors"
                              >
                                🔑 Reset
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* Security Tips */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span>💡</span>
                คำแนะนำด้านความปลอดภัย
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    icon: '🔐',
                    title: 'รหัสผ่านที่แข็งแกร่ง',
                    desc: 'ควรมีความยาวอย่างน้อย 8 ตัวอักษร ประกอบด้วยตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และอักขระพิเศษ',
                  },
                  {
                    icon: '🔄',
                    title: 'เปลี่ยนรหัสผ่านเป็นประจำ',
                    desc: 'แนะนำให้เปลี่ยนรหัสผ่านทุก 3-6 เดือน และไม่ใช้รหัสผ่านซ้ำกับบัญชีอื่น',
                  },
                  {
                    icon: '🚫',
                    title: 'บล็อกบัญชีที่น่าสงสัย',
                    desc: 'หากพบการเข้าใช้งานที่ผิดปกติ ควรบล็อกบัญชีทันทีและแจ้งให้เจ้าของทราบ',
                  },
                  {
                    icon: '📋',
                    title: 'ตรวจสอบ Log สม่ำเสมอ',
                    desc: 'ตรวจสอบประวัติการเข้าใช้งานเป็นประจำ เพื่อตรวจจับพฤติกรรมที่ผิดปกติในระบบ',
                  },
                ].map((tip) => (
                  <div
                    key={tip.title}
                    className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 flex gap-4"
                  >
                    <span className="text-2xl flex-shrink-0">{tip.icon}</span>
                    <div>
                      <h3 className="font-semibold text-white text-sm mb-1">{tip.title}</h3>
                      <p className="text-slate-400 text-xs leading-relaxed">{tip.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ═══ TAB 4: อัพโหลดข้อมูล ═══ */}
        {activeTab === 'upload' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-base font-semibold text-white mb-1">📤 อัพโหลดข้อมูลรายเดือน</h2>
              <p className="text-xs text-slate-500 mb-5">นำเข้าไฟล์รายงาน Excel (.xlsx) จาก First Community Business Portal · ระบบจะอัพเดตข้อมูลทั้งหมดอัตโนมัติ</p>
              <ExcelUpload onSuccess={() => { /* optionally refresh stats */ }} />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">📋 ขั้นตอนการอัพโหลด</h3>
              <ol className="space-y-2 text-xs text-slate-400">
                <li className="flex gap-2"><span className="text-brand-400 font-bold">1.</span>ดาวน์โหลดรายงานประจำเดือนจาก First Community Business Portal</li>
                <li className="flex gap-2"><span className="text-brand-400 font-bold">2.</span>เลือกไฟล์ .xlsx ที่ต้องการ (เลือกหลายเดือนพร้อมกันได้)</li>
                <li className="flex gap-2"><span className="text-brand-400 font-bold">3.</span>คลิก "อัพโหลด" รอระบบประมวลผล (~10-30 วินาที)</li>
                <li className="flex gap-2"><span className="text-brand-400 font-bold">4.</span>ข้อมูลทุกหน้าจะอัพเดตอัตโนมัติทันที</li>
              </ol>
            </div>

            {/* ── Knowledge Base ── */}
            <KnowledgeBase />
          </div>
        )}
      </div>
    </div>
  )
}
