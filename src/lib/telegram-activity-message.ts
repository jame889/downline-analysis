import { getAvailableMonths, getMembersForMonth } from '@/lib/db'
import { getDailyActivityAnalysis } from '@/lib/daily-activities'
import { loadBusinessReportSyncStatus } from '@/lib/business-report-sync'

function formatBv(value: number | undefined): string {
  return (value ?? 0).toLocaleString('en-US')
}

export async function buildTelegramActivityMessage(memberId: string): Promise<string> {
  const [activity, months, syncStatus] = await Promise.all([
    getDailyActivityAnalysis(memberId),
    getAvailableMonths(),
    loadBusinessReportSyncStatus(),
  ])
  const latestMonth = months.slice().sort().at(-1)
  const member = latestMonth
    ? (await getMembersForMonth(latestMonth)).find((item) => item.id === memberId)
    : undefined
  const report = member?.report
  const syncedAt = syncStatus?.syncedAt ? new Date(syncStatus.syncedAt) : null
  const syncedAtValid = syncedAt && !Number.isNaN(syncedAt.getTime())
  const isStale = !syncedAtValid || Date.now() - syncedAt.getTime() > 36 * 60 * 60 * 1000
  const sourceLabel = syncedAtValid
    ? new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(syncedAt)
    : latestMonth ?? 'ไม่ทราบ'
  const scoreTiming = isStale ? 'ตามข้อมูลล่าสุด' : 'ตอนนี้'
  const freshnessLine = isStale
    ? `⚠️ ข้อมูล Business Report ล่าสุด: ${sourceLabel} (เกิน 36 ชั่วโมง)\n`
    : `ข้อมูล Business Report อัปเดต: ${sourceLabel}\n`

  const alerts = activity.notifications.slice(0, 8)
  const lines = alerts.length > 0
    ? alerts.map((item) => `- ${item.title}: ${item.detail}`)
    : ['- ไม่มีงาน Follow-up ค้างหรือกิจกรรมที่ต้องแจ้งเตือนวันนี้']

  return (
    `<b>Coach JOE - Daily Action</b>\n\n` +
    freshnessLine +
    `คะแนนรวม ซ้าย-ขวา ${scoreTiming}: ซ้าย ${formatBv(report?.total_vol_left)} | ขวา ${formatBv(report?.total_vol_right)} BV\n` +
    `คะแนน BV ใหม่ ซ้าย-ขวา ${scoreTiming}: ซ้าย ${formatBv(report?.current_month_vol_left)} | ขวา ${formatBv(report?.current_month_vol_right)} BV\n\n` +
    `Weekly Score: ${activity.weeklyScorecard.score}/100 (${activity.weeklyScorecard.grade})\n` +
    `แผน 7 วัน: ทำแล้ว ${activity.planVsActual.completed7}/${activity.planVsActual.planned7} (${activity.planVsActual.completionPct ?? 0}%)\n` +
    `Funnel: Outreach ${activity.funnel.outreach} → นัด ${activity.funnel.appointments} → Meeting ${activity.funnel.meetings} → Sponsor ${activity.funnel.sponsors} → Start Up ${activity.funnel.startups}\n\n` +
    `${lines.join('\n')}\n\n` +
    `Priority: ${activity.weeklyScorecard.summary}`
  )
}
