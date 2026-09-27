import { randomUUID } from 'crypto'
import { loadBusinessReportMonths, loadBusinessReportSnapshotSeries, loadLatestBusinessReportSnapshot } from './business-report-sync'
import { loadDailyActivities, type DailyActivity } from './daily-activities'
import { hasSupabase, sbInsert, sbSelect } from './supabase'
import type { MonthlyReport } from './types'

export const JARVIS_READ_SCOPES = [
  'org.members.read',
  'org.structure.read',
  'org.performance.read',
  'org.activities.kpi.read',
  'learning.catalog.read',
  'learning.progress.read',
  'learning.assessment.read',
  'learning.skills.read',
] as const

type JarvisReadScope = typeof JARVIS_READ_SCOPES[number]

interface LearningModuleRow {
  id: string
  title: string
  track: string
  skill: string
  youtube_video_id: string
  duration_seconds: number | null
  sequence: number
  active: boolean
  updated_at: string
}

interface VideoProgressRow {
  member_id: string
  module_id: string
  watched_seconds: number
  max_progress_pct: number
  completed_at: string | null
  last_watched_at: string | null
  updated_at: string
}

interface AssessmentRow {
  id: string
  member_id: string
  module_id: string | null
  skill: string
  score: number
  max_score: number
  passed: boolean
  assessed_at: string
}

interface SkillScoreRow {
  member_id: string
  skill: string
  score: number
  source_count: number
  updated_at: string
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

function bangkokDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function offsetDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function resolvedStatus(activity: DailyActivity, today: string) {
  return activity.status ?? (activity.date <= today ? 'completed' : 'planned')
}

function activitySummary(activities: DailyActivity[], startDate: string, endDate: string, today: string) {
  const rows = activities.filter((item) =>
    item.date >= startDate
    && item.date <= endDate
    && resolvedStatus(item, today) !== 'cancelled'
  )
  const completed = rows.filter((item) => resolvedStatus(item, today) === 'completed')
  const outcomes = completed.map((item) => item.outcome ?? 'none')
  return {
    total: rows.length,
    completed: completed.length,
    activeDays: new Set(completed.map((item) => item.date)).size,
    startups: completed.filter((item) => item.type === 'start_up' || item.outcome === 'startup_completed').length,
    sponsors: outcomes.filter((outcome) => outcome === 'sponsored' || outcome === 'startup_completed').length,
    followUps: outcomes.filter((outcome) => outcome === 'follow_up').length,
    leftParticipants: completed.reduce((sum, item) => sum + item.leftCount, 0),
    rightParticipants: completed.reduce((sum, item) => sum + item.rightCount, 0),
  }
}

export function summarizeActivityKpis(activities: DailyActivity[], today = bangkokDateKey()) {
  const byMember = new Map<string, DailyActivity[]>()
  for (const activity of activities) {
    const values = byMember.get(activity.memberId) ?? []
    values.push(activity)
    byMember.set(activity.memberId, values)
  }

  return Array.from(byMember, ([memberId, values]) => {
    const past = values.filter((item) => item.date <= today && resolvedStatus(item, today) !== 'cancelled')
    const lastActivityDate = past.length
      ? past.reduce((latest, item) => item.date > latest ? item.date : latest, past[0].date)
      : null
    return {
      memberId,
      recent7: activitySummary(values, offsetDate(today, -6), today, today),
      recent30: activitySummary(values, offsetDate(today, -29), today, today),
      lastActivityDate,
    }
  }).sort((a, b) => a.memberId.localeCompare(b.memberId))
}

function reportSummary(report: MonthlyReport) {
  return {
    month: report.month,
    rank: report.income_position,
    highestPosition: report.highest_position,
    promotionGoal: report.promotion_goal,
    monthlyBV: report.monthly_bv,
    active: report.is_active,
    qualified: report.is_qualified,
    leftVolume: report.current_month_vol_left,
    rightVolume: report.current_month_vol_right,
    totalLeftVolume: report.total_vol_left,
    totalRightVolume: report.total_vol_right,
  }
}

async function optionalSelect<T>(table: string, params: string): Promise<T[]> {
  if (!hasSupabase()) return []
  try {
    return await sbSelect<T>(table, params)
  } catch (error) {
    console.warn(`[jarvis-read] optional table unavailable: ${table}`, error)
    return []
  }
}

async function loadLearningReadModel() {
  const [modules, progress, assessments, skillScores] = await Promise.all([
    optionalSelect<LearningModuleRow>('learning_modules', 'select=id,title,track,skill,youtube_video_id,duration_seconds,sequence,active,updated_at&active=eq.true&order=track,sequence,id'),
    optionalSelect<VideoProgressRow>('member_video_progress', 'select=member_id,module_id,watched_seconds,max_progress_pct,completed_at,last_watched_at,updated_at&order=member_id,module_id'),
    optionalSelect<AssessmentRow>('member_assessments', 'select=id,member_id,module_id,skill,score,max_score,passed,assessed_at&order=assessed_at.desc,id'),
    optionalSelect<SkillScoreRow>('member_skill_scores', 'select=member_id,skill,score,source_count,updated_at&order=member_id,skill'),
  ])
  return { modules, progress, assessments, skillScores }
}

export async function buildJarvisReadModel() {
  const latest = await loadLatestBusinessReportSnapshot()
  if (!latest) return null

  const historyLimit = clampInt(process.env.JARVIS_READ_HISTORY_MONTHS, 12, 1, 24)
  const availableMonths = (await loadBusinessReportMonths()).slice().sort()
  const historyMonths = availableMonths.slice(-historyLimit)
  const [series, activities, learning] = await Promise.all([
    loadBusinessReportSnapshotSeries(historyMonths),
    loadDailyActivities(),
    loadLearningReadModel(),
  ])

  const currentReports = new Map(latest.reports.map((report) => [report.member_id, report]))
  const members = Object.values(latest.members).map((member) => {
    const report = currentReports.get(member.id)
    return {
      id: member.id,
      name: member.name,
      sponsorId: member.sponsor_id,
      uplineId: member.upline_id,
      joinDate: member.join_date,
      level: member.lv,
      country: member.country,
      current: report ? reportSummary(report) : null,
    }
  }).sort((a, b) => a.id.localeCompare(b.id))

  const performanceHistory: Record<string, ReturnType<typeof reportSummary>[]> = {}
  for (const snapshot of series) {
    for (const report of snapshot.reports) {
      const values = performanceHistory[report.member_id] ?? []
      values.push(reportSummary(report))
      performanceHistory[report.member_id] = values
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    currentMonth: latest.month,
    sourceChecksum: latest.checksum,
    historyMonths,
    scopes: [...JARVIS_READ_SCOPES],
    policy: {
      readOnly: true,
      historyMonthLimit: historyLimit,
      rawActivityDetailsExposed: false,
      contactNamesExposed: false,
      credentialsExposed: false,
    },
    members,
    performanceHistory,
    activityKpis: summarizeActivityKpis(Object.values(activities)),
    learning,
  }
}

export async function recordJarvisReadAudit(endpoint: string, scopes: readonly JarvisReadScope[], counts: Record<string, number>) {
  if (!hasSupabase()) return
  try {
    await sbInsert('jarvis_data_access_audit', {
      id: randomUUID(),
      requested_at: new Date().toISOString(),
      endpoint,
      scopes,
      result_counts: counts,
      success: true,
    })
  } catch (error) {
    console.warn('[jarvis-read] audit write failed', error)
  }
}
