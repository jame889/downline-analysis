import Link from 'next/link'
import { getMonthlySummaries, getAvailableMonths, getMembersForMonth, bvToThb } from '@/lib/db'
import { ROOT_MEMBER_ID } from '@/lib/auth'
import StatsCard from '@/components/StatsCard'
import GrowthChart from '@/components/GrowthChart'
import BvChart from '@/components/BvChart'
import PositionDonut from '@/components/PositionDonut'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [months, summaries] = await Promise.all([getAvailableMonths(), getMonthlySummaries()])

  if (summaries.length === 0) {
    return (
      <div className="text-center py-24 text-slate-500">
        <p className="text-xl mb-2">ยังไม่มีข้อมูล</p>
        <p className="text-sm">อัปโหลด Business Report ในหน้า Admin หรือนำเข้าข้อมูลย้อนหลัง</p>
      </div>
    )
  }

  const lrByMonth = await Promise.all(months.slice().sort().map(async (month) => {
    const members = await getMembersForMonth(month)
    const root = members.find((member) => member.id === ROOT_MEMBER_ID)
    return {
      month,
      left: root?.report.total_vol_left ?? 0,
      right: root?.report.total_vol_right ?? 0,
      currLeft: root?.report.current_month_vol_left ?? 0,
      currRight: root?.report.current_month_vol_right ?? 0,
    }
  }))

  const latest = summaries[summaries.length - 1]
  const previous = summaries[summaries.length - 2]
  const latestLR = lrByMonth[lrByMonth.length - 1] ?? { left: 0, right: 0, currLeft: 0, currRight: 0 }
  const previousLR = lrByMonth[lrByMonth.length - 2] ?? { left: 0, right: 0 }
  const totalVolume = latestLR.left + latestLR.right
  const weakLeg = Math.min(latestLR.left, latestLR.right)
  const weakSide = latestLR.left <= latestLR.right ? 'ซ้าย' : 'ขวา'
  const leftPct = totalVolume ? (latestLR.left / totalVolume) * 100 : 0
  const rightPct = totalVolume ? (latestLR.right / totalVolume) * 100 : 0
  const growthPct = previous?.total_members
    ? ((latest.total_members - previous.total_members) / previous.total_members) * 100
    : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">ข้อมูลล่าสุด: {latest.month} · ครอบคลุม {months.length} เดือน</p>
        </div>
        <Link href={`/growth?member=${ROOT_MEMBER_ID}&months=9`} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400">
          เปิด Leader Growth Command Center →
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="สมาชิกทั้งหมด" value={latest.total_members} sub={`${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}% จากเดือนก่อน`} color="text-brand-400" />
        <StatsCard label="Active" value={latest.active_members} sub={`${latest.total_members ? ((latest.active_members / latest.total_members) * 100).toFixed(1) : 0}%`} color="text-green-400" />
        <StatsCard label="สมาชิกใหม่เดือนนี้" value={`+${latest.new_members}`} color="text-amber-400" />
        <StatsCard label="BV เดือนนี้" value={latest.total_bv.toLocaleString()} sub={`฿${bvToThb(latest.total_bv).toLocaleString()}`} color="text-purple-400" lr={{ left: latestLR.currLeft, right: latestLR.currRight, unit: ' BV' }} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-cyan-900/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Vol สะสม ซ้าย ({leftPct.toFixed(1)}%)</p>
          <p className="text-2xl font-bold text-cyan-400 mt-1">{latestLR.left.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-1">{latestLR.left - previousLR.left >= 0 ? '+' : ''}{(latestLR.left - previousLR.left).toLocaleString()} จากเดือนก่อน</p>
        </div>
        <div className="bg-slate-900 border border-amber-900/50 rounded-xl p-4">
          <p className="text-xs text-slate-400">Vol สะสม ขวา ({rightPct.toFixed(1)}%)</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">{latestLR.right.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-1">{latestLR.right - previousLR.right >= 0 ? '+' : ''}{(latestLR.right - previousLR.right).toLocaleString()} จากเดือนก่อน</p>
        </div>
        <div className="bg-orange-950/20 border border-orange-800/40 rounded-xl p-4">
          <p className="text-xs text-orange-300">Weak Leg ({weakSide})</p>
          <p className="text-2xl font-bold text-orange-300 mt-1">{weakLeg.toLocaleString()}</p>
          <p className="text-xs text-orange-700 mt-1">Gap เพื่อ Balance {(Math.max(latestLR.left, latestLR.right) - weakLeg).toLocaleString()} BV</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400">BV ใหม่ ซ้าย / ขวา</p>
          <p className="text-xl font-bold mt-2"><span className="text-cyan-400">{latestLR.currLeft.toLocaleString()}</span><span className="text-slate-600"> / </span><span className="text-amber-400">{latestLR.currRight.toLocaleString()}</span></p>
          <p className="text-xs text-slate-500 mt-1">Leading indicator ของ Momentum</p>
        </div>
      </div>

      {totalVolume > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex justify-between text-xs mb-2"><span className="text-cyan-400">ซ้าย {latestLR.left.toLocaleString()}</span><span className="text-amber-400">ขวา {latestLR.right.toLocaleString()}</span></div>
          <div className="flex h-5 overflow-hidden rounded-full bg-slate-800">
            <div className="bg-cyan-500 text-center text-xs text-white" style={{ width: `${leftPct}%` }}>{leftPct > 12 ? `${leftPct.toFixed(0)}%` : ''}</div>
            <div className="bg-amber-500 text-center text-xs text-slate-950 flex-1">{rightPct > 12 ? `${rightPct.toFixed(0)}%` : ''}</div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <GrowthChart summaries={summaries} lrData={lrByMonth} />
        <BvChart summaries={summaries} lrData={lrByMonth} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <PositionDonut counts={latest.position_counts} latestLR={{ left: latestLR.left, right: latestLR.right }} totalMembers={latest.total_members} activeMembers={latest.active_members} />
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">สรุปรายเดือน</h2>
          <div className="overflow-auto max-h-72">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 border-b border-slate-800"><th className="text-left pb-2">เดือน</th><th className="text-right pb-2">สมาชิก</th><th className="text-right pb-2">Active</th><th className="text-right pb-2">BV</th><th className="text-right pb-2 text-cyan-400">ซ้าย</th><th className="text-right pb-2 text-amber-400">ขวา</th></tr></thead>
              <tbody>{[...summaries].reverse().map((summary) => { const lr = lrByMonth.find((item) => item.month === summary.month); return <tr key={summary.month} className="border-b border-slate-800/50"><td className="py-2 text-slate-300">{summary.month}</td><td className="text-right text-white">{summary.total_members}</td><td className="text-right text-green-400">{summary.active_members}</td><td className="text-right text-purple-400">{summary.total_bv.toLocaleString()}</td><td className="text-right text-cyan-400">{(lr?.left ?? 0).toLocaleString()}</td><td className="text-right text-amber-400">{(lr?.right ?? 0).toLocaleString()}</td></tr> })}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
