import { getSession, ROOT_MEMBER_ID } from '@/lib/auth'
import { getAvailableMonths, getMembersForMonth } from '@/lib/db'
import { getGrowthDashboardData } from '@/lib/growth'
import LeaderGrowthDashboard from '@/components/LeaderGrowthDashboard'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams?: {
    member?: string
    months?: string
  }
}

export default async function GrowthCommandCenterPage({ searchParams }: Props) {
  const session = await getSession()
  const canSelectMember = !!session?.isAdmin
  const requestedMember = searchParams?.member
  const memberId = canSelectMember
    ? requestedMember || ROOT_MEMBER_ID
    : session?.memberId || ROOT_MEMBER_ID
  const window = Math.min(12, Math.max(3, Number(searchParams?.months ?? 9) || 9))

  const months = await getAvailableMonths()
  const latestMonth = months[0]
  const latestMembers = latestMonth ? await getMembersForMonth(latestMonth) : []
  const members = latestMembers
    .map((member) => ({ id: member.id, name: member.name }))
    .sort((a, b) => Number(a.id) - Number(b.id))

  const data = await getGrowthDashboardData(memberId, window)
  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
        <h1 className="text-xl font-bold text-white">ไม่พบข้อมูลย้อนหลังของสมาชิก {memberId}</h1>
        <p className="text-sm text-slate-500 mt-2">ตรวจรหัสสมาชิก หรือเลือกสมาชิกที่มีข้อมูลในรายงานล่าสุด</p>
      </div>
    )
  }

  return (
    <LeaderGrowthDashboard
      data={data}
      members={members}
      canSelectMember={canSelectMember}
      window={window}
    />
  )
}
