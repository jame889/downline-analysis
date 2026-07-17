'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from 'lucide-react'

const ACTIVITY_OPTIONS = [
  { value: 'post_social', label: 'Post Social', color: 'bg-sky-500' },
  { value: 'appointment_call', label: 'โทรนัดหมาย', color: 'bg-cyan-500' },
  { value: 'promotion_call', label: 'โทรโปรโมทงาน', color: 'bg-blue-500' },
  { value: 'house_meeting', label: 'House Meeting', color: 'bg-emerald-500' },
  { value: 'start_up', label: 'Start Up', color: 'bg-lime-500' },
  { value: 'zoom_line_meeting', label: 'Zoom/Line Meeting', color: 'bg-violet-500' },
  { value: 'unlock_meeting', label: 'Unlock Meeting', color: 'bg-fuchsia-500' },
  { value: 'big_house', label: 'Big House', color: 'bg-amber-500' },
  { value: 'one_day_take_off', label: 'One Day Take Off', color: 'bg-orange-500' },
  { value: 'the_first_class', label: 'The First Class', color: 'bg-rose-500' },
  { value: 'star_forum', label: 'Star Forum', color: 'bg-pink-500' },
  { value: 'camp', label: 'Camp', color: 'bg-teal-500' },
] as const

type ActivityType = (typeof ACTIVITY_OPTIONS)[number]['value']

interface Activity {
  id: string
  date: string
  startTime: string
  endTime: string
  type: ActivityType
  details: string
  leftCount: number
  rightCount: number
}

interface ActivityForm {
  id?: string
  date: string
  startTime: string
  endTime: string
  type: ActivityType
  details: string
  leftCount: number
  rightCount: number
}

const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

function newForm(date: string): ActivityForm {
  return {
    date,
    startTime: '09:00',
    endTime: '',
    type: 'post_social',
    details: '',
    leftCount: 0,
    rightCount: 0,
  }
}

function getMonthCells(viewDate: Date) {
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()
  const cellCount = first.getDay() + daysInMonth > 35 ? 42 : 35
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - first.getDay())

  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return {
      date,
      key: dateKey(date),
      isCurrentMonth: date.getMonth() === viewDate.getMonth(),
    }
  })
}

export default function ActivitiesPage() {
  const [viewDate, setViewDate] = useState(() => new Date())
  const [activities, setActivities] = useState<Activity[]>([])
  const [form, setForm] = useState<ActivityForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const currentMonth = monthKey(viewDate)
  const today = dateKey(new Date())
  const monthCells = useMemo(() => getMonthCells(viewDate), [viewDate])
  const activityByDate = useMemo(() => {
    const grouped: Record<string, Activity[]> = {}
    for (const activity of activities) {
      if (!grouped[activity.date]) grouped[activity.date] = []
      grouped[activity.date].push(activity)
    }
    return grouped
  }, [activities])

  const totals = useMemo(() => ({
    days: new Set(activities.map((item) => item.date)).size,
    left: activities.reduce((sum, item) => sum + item.leftCount, 0),
    right: activities.reduce((sum, item) => sum + item.rightCount, 0),
  }), [activities])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    fetch(`/api/activities?month=${currentMonth}`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'โหลดข้อมูลไม่สำเร็จ')
        if (active) setActivities(data.activities ?? [])
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [currentMonth])

  function moveMonth(offset: number) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  function openEdit(activity: Activity) {
    setError('')
    setForm({ ...activity })
  }

  async function saveActivity(event: React.FormEvent) {
    event.preventDefault()
    if (!form || saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ')
      setActivities((current) => {
        const next = current.filter((item) => item.id !== data.activity.id)
        return [...next, data.activity].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
      })
      setForm(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function removeActivity() {
    if (!form?.id || saving) return
    if (!window.confirm('ลบกิจกรรมนี้ใช่หรือไม่?')) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/activities?id=${encodeURIComponent(form.id)}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'ลบไม่สำเร็จ')
      setActivities((current) => current.filter((item) => item.id !== form.id))
      setForm(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const title = viewDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })

  return (
    <main className="mx-auto max-w-7xl px-3 py-5 sm:px-5 sm:py-7">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-brand-400">
            <CalendarDays className="h-5 w-5" />
            <span className="text-sm font-semibold">Daily Activity Planner</span>
          </div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">บันทึกกิจกรรมรายวัน</h1>
          <p className="mt-1 text-sm text-slate-400">วางแผนการทำงานและติดตามจำนวนผู้เข้าร่วมทีมซ้าย–ขวา</p>
        </div>

        <div className="grid grid-cols-3 divide-x divide-slate-700 overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
          <div className="px-4 py-2.5 text-center">
            <p className="text-xs text-slate-500">วันที่ลงมือทำ</p>
            <p className="mt-0.5 font-semibold text-white">{totals.days} วัน</p>
          </div>
          <div className="px-4 py-2.5 text-center">
            <p className="text-xs text-cyan-400">ทีมซ้าย</p>
            <p className="mt-0.5 font-semibold text-white">{totals.left} คน</p>
          </div>
          <div className="px-4 py-2.5 text-center">
            <p className="text-xs text-fuchsia-400">ทีมขวา</p>
            <p className="mt-0.5 font-semibold text-white">{totals.right} คน</p>
          </div>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 px-3 py-3 sm:px-5">
          <h2 className="text-xl font-bold text-white sm:text-2xl">{title}</h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="grid h-9 w-9 place-items-center rounded-md border border-slate-700 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              title="เดือนก่อนหน้า"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewDate(new Date())}
              className="h-9 rounded-md border border-slate-700 px-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
            >
              วันนี้
            </button>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="grid h-9 w-9 place-items-center rounded-md border border-slate-700 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              title="เดือนถัดไป"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-700 bg-slate-900/70">
          {WEEKDAYS.map((day, index) => (
            <div key={day} className={`py-2.5 text-center text-xs font-semibold sm:text-sm ${index === 0 || index === 6 ? 'text-slate-500' : 'text-slate-300'}`}>
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {monthCells.map((cell) => {
            const dayActivities = activityByDate[cell.key] ?? []
            const isToday = cell.key === today
            return (
              <div
                key={cell.key}
                className={`group relative min-h-24 overflow-hidden border-b border-r border-slate-800 p-1 text-left align-top transition-colors sm:min-h-32 sm:p-2 lg:min-h-36 ${
                  cell.isCurrentMonth ? 'bg-slate-950 hover:bg-slate-900/80' : 'cursor-default bg-slate-950/40'
                }`}
              >
                <button
                  type="button"
                  disabled={!cell.isCurrentMonth}
                  onClick={() => setForm(newForm(cell.key))}
                  aria-label={`เพิ่มกิจกรรมวันที่ ${cell.date.getDate()}`}
                  className={`mb-1 grid h-6 w-6 place-items-center rounded-full text-xs font-semibold sm:text-sm ${
                    isToday ? 'bg-brand-500 text-white' : cell.isCurrentMonth ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700'
                  }`}
                >
                  {cell.date.getDate()}
                </button>

                <div className="space-y-1">
                  {dayActivities.slice(0, 3).map((activity) => {
                    const option = ACTIVITY_OPTIONS.find((item) => item.value === activity.type)!
                    return (
                      <button
                        type="button"
                        key={activity.id}
                        onClick={() => openEdit(activity)}
                        className="flex h-6 w-full items-center gap-1 overflow-hidden rounded px-1.5 text-[10px] font-medium text-white sm:text-xs"
                        style={{ backgroundColor: 'rgb(30 41 59)' }}
                        title={`${activity.startTime} ${option.label}`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${option.color}`} />
                        <span className="hidden shrink-0 text-slate-400 sm:inline">{activity.startTime}</span>
                        <span className="truncate">{option.label}</span>
                      </button>
                    )
                  })}
                  {dayActivities.length > 3 && (
                    <span className="block px-1 text-[10px] font-medium text-slate-500">+{dayActivities.length - 3} รายการ</span>
                  )}
                </div>

                {cell.isCurrentMonth && dayActivities.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setForm(newForm(cell.key))}
                    className="absolute bottom-2 right-2 hidden h-7 w-7 place-items-center rounded-md text-slate-700 transition-colors group-hover:bg-slate-800 group-hover:text-brand-400 sm:grid"
                    title="เพิ่มกิจกรรม"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {loading && (
          <div className="absolute inset-x-0 top-1/2 text-center text-sm text-slate-500">กำลังโหลดกิจกรรม...</div>
        )}
      </section>

      {error && !form && (
        <p className="mt-3 rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <form onSubmit={saveActivity} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-lg border border-slate-700 bg-slate-900 shadow-2xl sm:rounded-lg">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-700 bg-slate-900 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                {form.id ? <Pencil className="h-4 w-4 text-brand-400" /> : <Plus className="h-4 w-4 text-brand-400" />}
                <h2 className="font-semibold text-white">{form.id ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรม'}</h2>
              </div>
              <button type="button" onClick={() => setForm(null)} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white" title="ปิด">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-4 sm:p-5">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-300">วันที่</span>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                  className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-brand-500"
                />
              </label>

              <div>
                <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-300"><Clock3 className="h-4 w-4" /> เวลา</span>
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    <span className="mb-1 block text-xs text-slate-500">เริ่ม</span>
                    <input type="time" required value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-brand-500" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs text-slate-500">สิ้นสุด (ไม่บังคับ)</span>
                    <input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-brand-500" />
                  </label>
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-300">กิจกรรม</span>
                <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ActivityType })} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-brand-500">
                  {ACTIVITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-300">รายละเอียด</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={form.details}
                  onChange={(event) => setForm({ ...form, details: event.target.value })}
                  placeholder="สถานที่ รายชื่อผู้เข้าร่วม หรือผลลัพธ์ที่เกิดขึ้น"
                  className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none placeholder:text-slate-600 focus:border-brand-500"
                />
              </label>

              <div>
                <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-300"><Users className="h-4 w-4" /> จำนวนผู้เข้าร่วม</span>
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    <span className="mb-1 block text-xs text-cyan-400">ทีมซ้าย (คน)</span>
                    <input type="number" min="0" max="9999" inputMode="numeric" value={form.leftCount} onChange={(event) => setForm({ ...form, leftCount: Number(event.target.value) })} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-cyan-500" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs text-fuchsia-400">ทีมขวา (คน)</span>
                    <input type="number" min="0" max="9999" inputMode="numeric" value={form.rightCount} onChange={(event) => setForm({ ...form, rightCount: Number(event.target.value) })} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-fuchsia-500" />
                  </label>
                </div>
              </div>

              {error && <p className="rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>}
            </div>

            <div className="sticky bottom-0 flex items-center gap-2 border-t border-slate-700 bg-slate-900 px-4 py-3 sm:px-5">
              {form.id && (
                <button type="button" onClick={removeActivity} disabled={saving} className="grid h-10 w-10 place-items-center rounded-md border border-red-900 text-red-400 hover:bg-red-950 disabled:opacity-50" title="ลบกิจกรรม">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button type="button" onClick={() => setForm(null)} className="ml-auto h-10 rounded-md border border-slate-700 px-4 text-sm font-medium text-slate-300 hover:bg-slate-800">ยกเลิก</button>
              <button type="submit" disabled={saving} className="flex h-10 items-center gap-2 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-50">
                <Save className="h-4 w-4" />
                {saving ? 'กำลังบันทึก...' : 'บันทึกกิจกรรม'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}
