import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  ACTIVITY_TYPES,
  deleteDailyActivity,
  loadDailyActivities,
  saveDailyActivity,
  type ActivityType,
  type DailyActivity,
} from '@/lib/daily-activities'

export const dynamic = 'force-dynamic'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MONTH_PATTERN = /^\d{4}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function safeCount(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(9999, Math.max(0, Math.floor(parsed)))
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = request.nextUrl.searchParams.get('month') ?? ''
  if (!MONTH_PATTERN.test(month)) {
    return NextResponse.json({ error: 'Invalid month' }, { status: 400 })
  }

  const values = await loadDailyActivities()
  const activities = Object.values(values)
    .filter((item) => item.memberId === session.memberId && item.date.startsWith(`${month}-`))
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))

  return NextResponse.json({ activities })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const date = String(body.date ?? '')
    const startTime = String(body.startTime ?? '')
    const endTime = String(body.endTime ?? '')
    const type = String(body.type ?? '') as ActivityType
    const details = String(body.details ?? '').trim().slice(0, 1000)

    if (!isValidDate(date) || !TIME_PATTERN.test(startTime)) {
      return NextResponse.json({ error: 'กรุณาระบุวันที่และเวลาให้ถูกต้อง' }, { status: 400 })
    }
    if (endTime && !TIME_PATTERN.test(endTime)) {
      return NextResponse.json({ error: 'เวลาสิ้นสุดไม่ถูกต้อง' }, { status: 400 })
    }
    if (!ACTIVITY_TYPES.includes(type)) {
      return NextResponse.json({ error: 'ประเภทกิจกรรมไม่ถูกต้อง' }, { status: 400 })
    }

    const values = await loadDailyActivities()
    const requestedId = typeof body.id === 'string' ? body.id : ''
    const existing = requestedId ? values[requestedId] : undefined
    if (existing && existing.memberId !== session.memberId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const now = new Date().toISOString()
    const activity: DailyActivity = {
      id: existing?.id ?? randomUUID(),
      memberId: session.memberId,
      date,
      startTime,
      endTime,
      type,
      details,
      leftCount: safeCount(body.leftCount),
      rightCount: safeCount(body.rightCount),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await saveDailyActivity(activity)
    return NextResponse.json({ success: true, activity })
  } catch (error) {
    console.error('[activities] Failed to save activity', error)
    return NextResponse.json({ error: 'ไม่สามารถบันทึกกิจกรรมได้' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: 'Activity id is required' }, { status: 400 })

  try {
    const deleted = await deleteDailyActivity(id, session.memberId)
    if (!deleted) return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[activities] Failed to delete activity', error)
    return NextResponse.json({ error: 'ไม่สามารถลบกิจกรรมได้' }, { status: 500 })
  }
}
