'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Save,
  Target,
  Trash2,
  TrendingUp,
  UserRoundCheck,
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
type ActivityStatus = 'planned' | 'completed' | 'cancelled'
type ActivityOutcome = 'none' | 'contacted' | 'appointment_booked' | 'attended' | 'follow_up' | 'sponsored' | 'startup_completed'

const STATUS_OPTIONS: Array<{ value: ActivityStatus; label: string }> = [
  { value: 'planned', label: 'วางแผนไว้' },
  { value: 'completed', label: 'ทำแล้ว' },
  { value: 'cancelled', label: 'ยกเลิก' },
]

const OUTCOME_OPTIONS: Array<{ value: ActivityOutcome; label: string }> = [
  { value: 'none', label: 'ยังไม่มีผลลัพธ์' },
  { value: 'contacted', label: 'ติดต่อได้' },
  { value: 'appointment_booked', label: 'นัดหมายสำเร็จ' },
  { value: 'attended', label: 'เข้าร่วม Meeting' },
  { value: 'follow_up', label: 'รอติดตามผล' },
  { value: 'sponsored', label: 'สมัครสมาชิก' },
  { value: 'startup_completed', label: 'Start Up สำเร็จ' },
]

interface Activity {
  id: string
  date: string
  startTime: string
  endTime: string
  type: ActivityType
  details: string
  leftCount: number
  rightCount: number
  status?: ActivityStatus
  outcome?: ActivityOutcome
  contactName?: string
  outcomeNotes?: string
  followUpDate?: string
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
  status: ActivityStatus
  outcome: ActivityOutcome
  contactName: string
  outcomeNotes: string
  followUpDate: string
}

interface ActivityAnalysis {
  funnel: {
    outreach: number; appointments: number; meetings: number; followUps: number; sponsors: number; startups: number
    outreachToAppointmentPct: number | null; appointmentToMeetingPct: number | null; meetingToSponsorPct: number | null
  }
  planVsActual: { planned7: number; completed7: number; cancelled7: number; completionPct: number | null }
  weeklyScorecard: {
    score: number; grade: 'A' | 'B' | 'C' | 'D'; consistencyScore: number; conversionScore: number
    weakLegScore: number; sponsorScore: number; startupScore: number; weakSide: 'L' | 'R'; weakLegParticipants: number; summary: string
  }
  notifications: Array<{
    id: string; severity: 'high' | 'medium' | 'low'; title: string; detail: string; date?: string; activityId?: string
  }>
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
  const status: ActivityStatus = date <= dateKey(new Date()) ? 'completed' : 'planned'
  return {
    date,
    startTime: '09:00',
    endTime: '',
    type: 'post_social',
    details: '',
    leftCount: 0,
    rightCount: 0,
    status,
    outcome: 'none',
    contactName: '',
    outcomeNotes: '',
    followUpDate: '',
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
  const [analysis, setAnalysis] = useState<ActivityAnalysis | null>(null)
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
        if (active) {
          setActivities(data.activities ?? [])
          setAnalysis(data.analysis ?? null)
        }
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
    setForm({
      ...activity,
      status: activity.status ?? (activity.date <= today ? 'completed' : 'planned'),
      outcome: activity.outcome ?? 'none',
      contactName: activity.contactName ?? '',
      outcomeNotes: activity.outcomeNotes ?? '',
      followUpDate: activity.followUpDate ?? '',
    })
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
      setAnalysis(data.analysis ?? null)
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
      setAnalysis(data.analysis ?? null)
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

      {analysis && (
        <>
          <section className="mb-5 grid gap-px overflow-hidden rounded-lg border border-slate-700 bg-slate-700 lg:grid-cols-[240px_1fr_1fr]">
            <div className="bg-slate-900 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-300"><Target className="h-4 w-4 text-brand-400" /> Weekly Score</span>
                <span className={`grid h-9 w-9 place-items-center rounded-md text-lg font-bold ${analysis.weeklyScorecard.grade === 'A' ? 'bg-emerald-500/20 text-emerald-300' : analysis.weeklyScorecard.grade === 'B' ? 'bg-cyan-500/20 text-cyan-300' : analysis.weeklyScorecard.grade === 'C' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>{analysis.weeklyScorecard.grade}</span>
              </div>
              <p className="mt-3 text-3xl font-bold text-white">{analysis.weeklyScorecard.score}<span className="text-base font-normal text-slate-500">/100</span></p>
              <p className="mt-2 text-xs leading-5 text-slate-400">{analysis.weeklyScorecard.summary}</p>
            </div>

            <div className="bg-slate-950 p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300"><TrendingUp className="h-4 w-4 text-cyan-400" /> แผนเทียบผลงาน 7 วัน</div>
              <div className="grid grid-cols-3 gap-3">
                <div><p className="text-xs text-slate-500">วางแผน</p><p className="mt-1 text-xl font-semibold text-white">{analysis.planVsActual.planned7}</p></div>
                <div><p className="text-xs text-slate-500">ทำแล้ว</p><p className="mt-1 text-xl font-semibold text-emerald-300">{analysis.planVsActual.completed7}</p></div>
                <div><p className="text-xs text-slate-500">สำเร็จ</p><p className="mt-1 text-xl font-semibold text-cyan-300">{analysis.planVsActual.completionPct ?? 0}%</p></div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded bg-slate-800">
                <div className="h-full bg-cyan-500" style={{ width: `${Math.min(100, analysis.planVsActual.completionPct ?? 0)}%` }} />
              </div>
            </div>

            <div className="bg-slate-950 p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> องค์ประกอบคะแนน</div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-xs">
                {[
                  ['ความสม่ำเสมอ', analysis.weeklyScorecard.consistencyScore, 25],
                  ['Conversion', analysis.weeklyScorecard.conversionScore, 25],
                  [`Weak Leg ${analysis.weeklyScorecard.weakSide === 'L' ? 'ซ้าย' : 'ขวา'}`, analysis.weeklyScorecard.weakLegScore, 20],
                  ['Sponsor', analysis.weeklyScorecard.sponsorScore, 15],
                  ['Start Up', analysis.weeklyScorecard.startupScore, 15],
                ].map(([label, value, max]) => (
                  <div key={String(label)}>
                    <div className="mb-1 flex justify-between text-slate-400"><span>{label}</span><span>{value}/{max}</span></div>
                    <div className="h-1.5 overflow-hidden rounded bg-slate-800"><div className="h-full bg-brand-500" style={{ width: `${(Number(value) / Number(max)) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mb-5 border-y border-slate-800 py-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300"><UserRoundCheck className="h-4 w-4 text-cyan-400" /> Conversion Funnel 30 วัน</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[
                ['Outreach', analysis.funnel.outreach],
                ['นัดหมาย', analysis.funnel.appointments],
                ['Meeting', analysis.funnel.meetings],
                ['Follow-up', analysis.funnel.followUps],
                ['Sponsor', analysis.funnel.sponsors],
                ['Start Up', analysis.funnel.startups],
              ].map(([label, value], index) => (
                <div key={String(label)} className="border-l-2 border-slate-700 bg-slate-900/60 px-3 py-3 first:border-cyan-500 last:border-emerald-500">
                  <p className="text-[11px] text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-semibold text-white">{value}</p>
                  {index < 3 && <p className="mt-1 text-[10px] text-slate-600">{(index === 0 ? analysis.funnel.outreachToAppointmentPct : index === 1 ? analysis.funnel.appointmentToMeetingPct : analysis.funnel.meetingToSponsorPct) ?? 0}% ขั้นถัดไป</p>}
                </div>
              ))}
            </div>
          </section>

          {analysis.notifications.length > 0 && (
            <section className="mb-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300"><Bell className="h-4 w-4 text-amber-400" /> ต้องทำวันนี้ ({analysis.notifications.length})</div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {analysis.notifications.slice(0, 6).map((notice) => (
                  <button
                    type="button"
                    key={notice.id}
                    onClick={() => {
                      const activity = activities.find((item) => item.id === notice.activityId)
                      if (activity) openEdit(activity)
                    }}
                    className={`min-h-20 border-l-2 bg-slate-900 px-3 py-2.5 text-left transition-colors hover:bg-slate-800 ${notice.severity === 'high' ? 'border-red-500' : notice.severity === 'medium' ? 'border-amber-500' : 'border-cyan-500'}`}
                  >
                    <p className="text-sm font-semibold text-white">{notice.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{notice.detail}</p>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

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

              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-300">สถานะ</span>
                <div className="grid grid-cols-3 overflow-hidden rounded-md border border-slate-700">
                  {STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm({ ...form, status: option.value })}
                      className={`h-10 border-r border-slate-700 text-sm font-medium last:border-r-0 ${form.status === option.value ? 'bg-brand-500 text-white' : 'bg-slate-950 text-slate-400 hover:bg-slate-800'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-300">ผลลัพธ์</span>
                  <select value={form.outcome} onChange={(event) => setForm({ ...form, outcome: event.target.value as ActivityOutcome })} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-brand-500">
                    {OUTCOME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-300">ชื่อผู้ติดต่อ/สมาชิก</span>
                  <input
                    type="text"
                    maxLength={160}
                    value={form.contactName}
                    onChange={(event) => setForm({ ...form, contactName: event.target.value })}
                    placeholder="ชื่อที่ต้องติดตาม"
                    className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none placeholder:text-slate-600 focus:border-brand-500"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-300">วันติดตามผล</span>
                  <input type="date" required={form.outcome === 'follow_up'} value={form.followUpDate} onChange={(event) => setForm({ ...form, followUpDate: event.target.value })} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-amber-500" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-300">หมายเหตุผลลัพธ์</span>
                  <input
                    type="text"
                    maxLength={1000}
                    value={form.outcomeNotes}
                    onChange={(event) => setForm({ ...form, outcomeNotes: event.target.value })}
                    placeholder="คำตอบหรือขั้นตอนถัดไป"
                    className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-white outline-none placeholder:text-slate-600 focus:border-brand-500"
                  />
                </label>
              </div>

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
