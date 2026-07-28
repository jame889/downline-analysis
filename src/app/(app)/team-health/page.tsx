import { getSession, ROOT_MEMBER_ID } from '@/lib/auth'
import { getMonthlyTeamHealth } from '@/lib/team-health'
import MonthlyTeamHealth from '@/components/MonthlyTeamHealth'

export const dynamic = 'force-dynamic'

export default async function TeamHealthPage({ searchParams }: { searchParams?: { month?: string; member?: string } }) {
  const session = await getSession()
  const memberId = session?.isAdmin && searchParams?.member ? searchParams.member : session?.memberId ?? ROOT_MEMBER_ID
  const data = await getMonthlyTeamHealth(memberId, searchParams?.month)
  if (!data) return <div className="border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">ไม่พบข้อมูล Business Report สำหรับสมาชิกนี้</div>
  return <MonthlyTeamHealth data={data} memberId={memberId} isAdmin={Boolean(session?.isAdmin)} />
}
