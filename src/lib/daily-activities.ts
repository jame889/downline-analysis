import fs from 'fs'
import path from 'path'
import { BlobPreconditionFailedError, get, put } from '@vercel/blob'

const BLOB_PATH = 'member-activities/daily-activities.json'
const LOCAL_PATH = path.join(process.cwd(), 'data', 'daily-activities.json')

export const ACTIVITY_TYPES = [
  'post_social',
  'appointment_call',
  'promotion_call',
  'house_meeting',
  'start_up',
  'zoom_line_meeting',
  'unlock_meeting',
  'big_house',
  'one_day_take_off',
  'the_first_class',
  'star_forum',
  'camp',
] as const

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  post_social: 'Post Social',
  appointment_call: 'โทรนัดหมาย',
  promotion_call: 'โทรโปรโมทงาน',
  house_meeting: 'House Meeting',
  start_up: 'Start Up',
  zoom_line_meeting: 'Zoom/Line Meeting',
  unlock_meeting: 'Unlock Meeting',
  big_house: 'Big House',
  one_day_take_off: 'One Day Take Off',
  the_first_class: 'The First Class',
  star_forum: 'Star Forum',
  camp: 'Camp',
}

export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export const ACTIVITY_STATUSES = ['planned', 'completed', 'cancelled'] as const
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

export const ACTIVITY_OUTCOMES = [
  'none',
  'contacted',
  'appointment_booked',
  'attended',
  'follow_up',
  'sponsored',
  'startup_completed',
] as const
export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number]

export const ACTIVITY_OUTCOME_LABELS: Record<ActivityOutcome, string> = {
  none: 'ยังไม่มีผลลัพธ์',
  contacted: 'ติดต่อได้',
  appointment_booked: 'นัดหมายสำเร็จ',
  attended: 'เข้าร่วม Meeting',
  follow_up: 'รอติดตามผล',
  sponsored: 'สมัครสมาชิก',
  startup_completed: 'Start Up สำเร็จ',
}

export interface DailyActivity {
  id: string
  memberId: string
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
  createdAt: string
  updatedAt: string
}

export interface ActivityPeriodSummary {
  totalActivities: number
  activeDays: number
  leftParticipants: number
  rightParticipants: number
  outreachCount: number
  meetingCount: number
  startupCount: number
}

export interface DailyActivityAnalysis {
  asOfDate: string
  recent30: ActivityPeriodSummary & {
    startDate: string
    endDate: string
    consistencyPct: number
    meetingToOutreachPct: number | null
  }
  recent7: ActivityPeriodSummary
  previous7: ActivityPeriodSummary
  momentumChangePct: number | null
  currentStreakDays: number
  lastActivityDate: string | null
  typeBreakdown: Array<{
    type: ActivityType
    label: string
    count: number
    leftParticipants: number
    rightParticipants: number
  }>
  upcoming7: {
    totalActivities: number
    activeDays: number
    startDate: string
    endDate: string
  }
  funnel: {
    outreach: number
    appointments: number
    meetings: number
    followUps: number
    sponsors: number
    startups: number
    outreachToAppointmentPct: number | null
    appointmentToMeetingPct: number | null
    meetingToSponsorPct: number | null
  }
  planVsActual: {
    planned7: number
    completed7: number
    cancelled7: number
    completionPct: number | null
  }
  weeklyScorecard: {
    score: number
    grade: 'A' | 'B' | 'C' | 'D'
    consistencyScore: number
    conversionScore: number
    weakLegScore: number
    sponsorScore: number
    startupScore: number
    weakSide: 'L' | 'R'
    weakLegParticipants: number
    summary: string
  }
  notifications: Array<{
    id: string
    severity: 'high' | 'medium' | 'low'
    title: string
    detail: string
    date?: string
    activityId?: string
  }>
  recentEntries: Array<{
    date: string
    startTime: string
    type: ActivityType
    label: string
    details: string
    leftCount: number
    rightCount: number
    status: ActivityStatus
    outcome: ActivityOutcome
    contactName: string
    outcomeNotes: string
    followUpDate: string
  }>
}

type ActivityStore = Record<string, DailyActivity>
type BlobStore = { values: ActivityStore; etag?: string }

function hasBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
}

function readLocal(): ActivityStore {
  try {
    if (!fs.existsSync(LOCAL_PATH)) return {}
    return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf-8')) as ActivityStore
  } catch {
    return {}
  }
}

function writeLocal(values: ActivityStore): void {
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true })
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(values, null, 2), 'utf-8')
}

async function readBlob(): Promise<BlobStore> {
  const result = await get(BLOB_PATH, { access: 'private', useCache: false })
  if (!result || result.statusCode !== 200) return { values: {} }
  const text = await new Response(result.stream).text()
  return { values: JSON.parse(text) as ActivityStore, etag: result.blob.etag }
}

export async function loadDailyActivities(): Promise<ActivityStore> {
  if (!hasBlobStorage()) return readLocal()
  try {
    return (await readBlob()).values
  } catch (error) {
    console.error('[daily-activities] Failed to read Blob storage', error)
    return {}
  }
}

async function mutateStore(mutator: (values: ActivityStore) => void): Promise<void> {
  if (!hasBlobStorage()) {
    const values = readLocal()
    mutator(values)
    writeLocal(values)
    return
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { values, etag } = await readBlob()
    mutator(values)

    try {
      await put(BLOB_PATH, JSON.stringify(values), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: Boolean(etag),
        cacheControlMaxAge: 60,
        contentType: 'application/json',
        ...(etag ? { ifMatch: etag } : {}),
      })
      return
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError) || attempt === 2) throw error
    }
  }
}

export async function saveDailyActivity(activity: DailyActivity): Promise<void> {
  await mutateStore((values) => {
    values[activity.id] = activity
  })
}

export async function deleteDailyActivity(id: string, memberId: string): Promise<boolean> {
  let deleted = false
  await mutateStore((values) => {
    if (values[id]?.memberId === memberId) {
      delete values[id]
      deleted = true
    }
  })
  return deleted
}

function bangkokDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function offsetDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function summarizeActivities(activities: DailyActivity[]): ActivityPeriodSummary {
  const outreachTypes = new Set<ActivityType>(['post_social', 'appointment_call', 'promotion_call'])
  return {
    totalActivities: activities.length,
    activeDays: new Set(activities.map((item) => item.date)).size,
    leftParticipants: activities.reduce((sum, item) => sum + item.leftCount, 0),
    rightParticipants: activities.reduce((sum, item) => sum + item.rightCount, 0),
    outreachCount: activities.filter((item) => outreachTypes.has(item.type)).length,
    meetingCount: activities.filter((item) => !outreachTypes.has(item.type)).length,
    startupCount: activities.filter((item) => item.type === 'start_up').length,
  }
}

function between(activities: DailyActivity[], startDate: string, endDate: string): DailyActivity[] {
  return activities.filter((item) => item.date >= startDate && item.date <= endDate)
}

function resolvedStatus(activity: DailyActivity, today: string): ActivityStatus {
  return activity.status ?? (activity.date <= today ? 'completed' : 'planned')
}

function resolvedOutcome(activity: DailyActivity): ActivityOutcome {
  return activity.outcome && ACTIVITY_OUTCOMES.includes(activity.outcome) ? activity.outcome : 'none'
}

function percent(part: number, total: number): number | null {
  return total > 0 ? Math.min(100, Math.round((part / total) * 100)) : null
}

export async function getDailyActivityAnalysis(
  memberId: string,
  now = new Date(),
  businessWeakSide?: 'L' | 'R'
): Promise<DailyActivityAnalysis> {
  const values = await loadDailyActivities()
  const today = bangkokDateKey(now)
  const memberActivities = Object.values(values).filter((item) => item.memberId === memberId)
  const completed = memberActivities.filter((item) => item.date <= today && resolvedStatus(item, today) === 'completed')

  const recent30Start = offsetDate(today, -29)
  const recent7Start = offsetDate(today, -6)
  const previous7Start = offsetDate(today, -13)
  const previous7End = offsetDate(today, -7)
  const upcomingStart = offsetDate(today, 1)
  const upcomingEnd = offsetDate(today, 7)

  const recent30Activities = between(completed, recent30Start, today)
  const recent7Activities = between(completed, recent7Start, today)
  const previous7Activities = between(completed, previous7Start, previous7End)
  const upcomingActivities = between(memberActivities, upcomingStart, upcomingEnd)
    .filter((item) => resolvedStatus(item, today) !== 'cancelled')
  const recent30Summary = summarizeActivities(recent30Activities)
  const recent7Summary = summarizeActivities(recent7Activities)
  const previous7Summary = summarizeActivities(previous7Activities)

  const outcomes = recent30Activities.map((item) => resolvedOutcome(item))
  const outreachTypes = new Set<ActivityType>(['post_social', 'appointment_call', 'promotion_call'])
  const funnelOutreach = recent30Activities.filter((item) => outreachTypes.has(item.type)).length
  const funnelAppointments = outcomes.filter((item) => ['appointment_booked', 'attended', 'follow_up', 'sponsored', 'startup_completed'].includes(item)).length
  const funnelMeetings = recent30Activities.filter((item) =>
    (!outreachTypes.has(item.type) && item.type !== 'start_up')
    || ['attended', 'follow_up', 'sponsored', 'startup_completed'].includes(resolvedOutcome(item))
  ).length
  const funnelFollowUps = outcomes.filter((item) => item === 'follow_up').length
  const funnelSponsors = outcomes.filter((item) => ['sponsored', 'startup_completed'].includes(item)).length
  const funnelStartups = recent30Activities.filter((item) => item.type === 'start_up' || resolvedOutcome(item) === 'startup_completed').length

  const recent7All = between(memberActivities, recent7Start, today)
  const planned7 = recent7All.filter((item) => resolvedStatus(item, today) !== 'cancelled').length
  const completed7 = recent7All.filter((item) => resolvedStatus(item, today) === 'completed').length
  const cancelled7 = recent7All.filter((item) => resolvedStatus(item, today) === 'cancelled').length
  const dueFollowUps = memberActivities.filter((item) => {
    const outcome = resolvedOutcome(item)
    return Boolean(item.followUpDate)
      && item.followUpDate! <= today
      && !['sponsored', 'startup_completed'].includes(outcome)
      && resolvedStatus(item, today) !== 'cancelled'
  })
  const unreviewedPast = memberActivities.filter((item) => item.date < today && resolvedStatus(item, today) === 'planned')
  const todayActivities = memberActivities.filter((item) => item.date === today && resolvedStatus(item, today) === 'planned')

  const consistencyScore = Math.min(25, recent7Summary.activeDays * 5)
  const conversionScore = Math.min(25, Math.min(funnelAppointments, 3) * 5 + Math.min(funnelMeetings, 2) * 5)
  const weakSide = businessWeakSide ?? (recent30Summary.leftParticipants <= recent30Summary.rightParticipants ? 'L' : 'R')
  const weakLegParticipants = weakSide === 'L' ? recent30Summary.leftParticipants : recent30Summary.rightParticipants
  const totalParticipants = recent30Summary.leftParticipants + recent30Summary.rightParticipants
  const weakLegScore = totalParticipants === 0 ? 0 : Math.min(20, Math.round((weakLegParticipants / totalParticipants) * 20))
  const sponsorScore = Math.min(15, funnelSponsors * 15)
  const startupScore = Math.min(15, funnelStartups * 15)
  const score = consistencyScore + conversionScore + weakLegScore + sponsorScore + startupScore
  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 45 ? 'C' : 'D'
  const scoreSummary = dueFollowUps.length > 0
    ? `ติดตามงานค้าง ${dueFollowUps.length} รายการก่อนเพิ่มกิจกรรมใหม่`
    : funnelOutreach > 0 && funnelAppointments === 0
      ? 'ปรับข้อความเชิญและเปลี่ยน Outreach ให้เป็นนัดหมาย'
      : planned7 > 0 && completed7 < planned7
        ? 'ปิดงานตามแผนที่ค้างและบันทึกผลลัพธ์ให้ครบ'
        : 'รักษาความสม่ำเสมอและเพิ่มผลลัพธ์ถึง Sponsor/Start Up'

  const notifications: DailyActivityAnalysis['notifications'] = [
    ...dueFollowUps.slice(0, 8).map((item) => ({
      id: `followup-${item.id}`,
      severity: 'high' as const,
      title: `ติดตาม ${item.contactName || ACTIVITY_TYPE_LABELS[item.type]}`,
      detail: item.followUpDate! < today ? 'เลยวันติดตามแล้ว ควรติดต่อวันนี้' : 'ถึงกำหนดติดตามวันนี้',
      date: item.followUpDate,
      activityId: item.id,
    })),
    ...unreviewedPast.slice(0, 5).map((item) => ({
      id: `review-${item.id}`,
      severity: 'medium' as const,
      title: 'กิจกรรมผ่านไปแล้วแต่ยังไม่บันทึกผล',
      detail: `${ACTIVITY_TYPE_LABELS[item.type]} วันที่ ${item.date}`,
      date: item.date,
      activityId: item.id,
    })),
    ...todayActivities.slice(0, 5).map((item) => ({
      id: `today-${item.id}`,
      severity: 'low' as const,
      title: `กิจกรรมวันนี้ ${item.startTime}`,
      detail: `${ACTIVITY_TYPE_LABELS[item.type]}${item.contactName ? ` · ${item.contactName}` : ''}`,
      date: item.date,
      activityId: item.id,
    })),
  ]

  const byType = new Map<ActivityType, DailyActivity[]>()
  for (const activity of recent30Activities) {
    const items = byType.get(activity.type) ?? []
    items.push(activity)
    byType.set(activity.type, items)
  }
  const typeBreakdown = Array.from(byType, ([type, items]) => ({
    type,
    label: ACTIVITY_TYPE_LABELS[type],
    count: items.length,
    leftParticipants: items.reduce((sum, item) => sum + item.leftCount, 0),
    rightParticipants: items.reduce((sum, item) => sum + item.rightCount, 0),
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'th'))

  const activeDates = new Set(completed.map((item) => item.date))
  const lastActivityDate = completed.length
    ? completed.reduce((latest, item) => item.date > latest ? item.date : latest, completed[0].date)
    : null
  let currentStreakDays = 0
  if (lastActivityDate) {
    let cursor = lastActivityDate
    while (activeDates.has(cursor)) {
      currentStreakDays++
      cursor = offsetDate(cursor, -1)
    }
  }

  const momentumChangePct = previous7Summary.totalActivities === 0
    ? (recent7Summary.totalActivities > 0 ? 100 : null)
    : Math.round(((recent7Summary.totalActivities - previous7Summary.totalActivities) / previous7Summary.totalActivities) * 100)

  return {
    asOfDate: today,
    recent30: {
      ...recent30Summary,
      startDate: recent30Start,
      endDate: today,
      consistencyPct: Math.round((recent30Summary.activeDays / 30) * 100),
      meetingToOutreachPct: recent30Summary.outreachCount > 0
        ? Math.round((recent30Summary.meetingCount / recent30Summary.outreachCount) * 100)
        : null,
    },
    recent7: recent7Summary,
    previous7: previous7Summary,
    momentumChangePct,
    currentStreakDays,
    lastActivityDate,
    typeBreakdown,
    upcoming7: {
      totalActivities: upcomingActivities.length,
      activeDays: new Set(upcomingActivities.map((item) => item.date)).size,
      startDate: upcomingStart,
      endDate: upcomingEnd,
    },
    funnel: {
      outreach: funnelOutreach,
      appointments: funnelAppointments,
      meetings: funnelMeetings,
      followUps: funnelFollowUps,
      sponsors: funnelSponsors,
      startups: funnelStartups,
      outreachToAppointmentPct: percent(funnelAppointments, funnelOutreach),
      appointmentToMeetingPct: percent(funnelMeetings, funnelAppointments),
      meetingToSponsorPct: percent(funnelSponsors, funnelMeetings),
    },
    planVsActual: {
      planned7,
      completed7,
      cancelled7,
      completionPct: percent(completed7, planned7),
    },
    weeklyScorecard: {
      score,
      grade,
      consistencyScore,
      conversionScore,
      weakLegScore,
      sponsorScore,
      startupScore,
      weakSide,
      weakLegParticipants,
      summary: scoreSummary,
    },
    notifications,
    recentEntries: recent30Activities
      .slice()
      .sort((a, b) => `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`))
      .slice(0, 12)
      .map((item) => ({
        date: item.date,
        startTime: item.startTime,
        type: item.type,
        label: ACTIVITY_TYPE_LABELS[item.type],
        details: item.details.slice(0, 240),
        leftCount: item.leftCount,
        rightCount: item.rightCount,
        status: resolvedStatus(item, today),
        outcome: resolvedOutcome(item),
        contactName: item.contactName ?? '',
        outcomeNotes: item.outcomeNotes ?? '',
        followUpDate: item.followUpDate ?? '',
      })),
  }
}
