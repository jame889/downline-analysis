import { getMonthlySummaries, getAvailableMonths, getMembersForMonth, bvToThb } from '@/lib/db'
import { ROOT_MEMBER_ID } from '@/lib/auth'
import StatsCard from '@/components/StatsCard'
import GrowthChart from '@/components/GrowthChart'
import BvChart from '@/components/BvChart'
import PositionDonut from '@/components/PositionDonut'

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  const months = getAvailableMonths()               // newest first
  const summaries = getMonthlySummaries()            // oldest first

  if (summaries.length === 0) {
    return (
      <div className="text-center py-24 text-slate-500">
        <p className="text-xl mb-2">ยังไม่มีข้อมูล</p>
        <p className="text-sm">
          รัน <code className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">npm run import</code> เพื่อนำเข้าข้อมูล
        </p>
      </div>
    )
  }

  const latest = summaries[summaries.length - 1]
  const prev   = summaries[summaries.length - 2]

  const growthPct = prev
    ? (((latest.total_members - prev.total_members) / prev.total_members) * 100).toFixed(1)
    : null

  // ── Root member L/R per month ──────────────────────────────────────────────
  // Build month → { left, right } map
  const lrByMonth = months.slice().sort().map((month) => {
    const members = getMembersForMonth(month)
    const root = members.find((m) => m.id === ROOT_MEMBER_ID)
    return {
      month,
      left:  root?.report.total_vol_left  ?? 0,
      right: root?.report.total_vol_right ?? 0,
      currLeft:  root?.report.current_month_vol_left  ?? 0,
      currRight: root?.report.current_month_vol_right ?? 0,
    }
  })

  const latestLR = lrByMonth[lrByMonth.length - 1] ?? { left: 0, right: 0, currLeft: 0, currRight: 0 }
  const prevLR   = lrByMonth[lrByMonth.length - 2] ?? { left: 0, right: 0 }

  const leftVol   = latestLR.left
  const rightVol  = latestLR.right
  const totalVol  = leftVol + rightVol
  const weakLeg   = Math.min(leftVol, rightVol)
  const leftPct   = totalVol > 0 ? ((leftVol  / totalVol) * 100).toFixed(1) : '0'
  const rightPct  = totalVol > 0 ? ((rightVol / totalVol) * 100).toFixed(1) : '0'
  const weakSide  = leftVol <= rightVol ? 'ซ้าย' : 'ขวา'

  // Active members prev month for delta
  const activeDelta = prev ? latest.active_members - prev.active_members : null

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">
          ข้อมูลล่าสุด: {latest.month} · {months.length} เดือน
        </p>
      </div>

      {/* ── Row 1: 4 stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

        <StatsCard
          label="สมาชิกทั้งหมด"
          value={latest.total_members}
          sub={growthPct ? `+${growthPct}% จากเดือนก่อน` : undefined}
          color="text-brand-400"
        />

        <StatsCard
          label="Active"
          value={latest.active_members}
          sub={`${((latest.active_members / latest.total_members) * 100).toFixed(1)}% · ${activeDelta != null && activeDelta >= 0 ? '+' : ''}${activeDelta ?? ''}`}
          color="text-green-400"
        />

        <StatsCard
          label="สมาชิกใหม่เดือนนี้"
          value={`+${latest.new_members}`}
          color="text-amber-400"
        />

        {/* BV card with L/R */}
        <StatsCard
          label="BV เดือนนี้ (ซ้าย / ขวา)"
          value={latest.total_bv.toLocaleString()}
          sub={`฿${bvToThb(latest.total_bv).toLocaleString()}`}
          color="text-purple-400"
          lr={{
            left:  latestLR.currLeft,
            right: latestLR.currRight,
            unit:  ' BV',
          }}
        />
      </div>

      {/* ── Row 2: Vol summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Vol สะสม ซ้าย ({leftPct}%)</p>
          <p className="text-2xl font-bold text-sky-400">{leftVol.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-1">฿{bvToThb(leftVol).toLocaleString()}</p>
          {prevLR.left > 0 && (
            <p className="text-xs text-sky-700 mt-0.5">
              +{(leftVol - prevLR.left).toLocaleString()} จากเดือนก่อน
            </p>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Vol สะสม ขวา ({rightPct}%)</p>
          <p className="text-2xl font-bold text-purple-400">{rightVol.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-1">฿{bvToThb(rightVol).toLocaleString()}</p>
          {prevLR.right > 0 && (
            <p className="text-xs text-purple-700 mt-0.5">
              +{(rightVol - prevLR.right).toLocaleString()} จากเดือนก่อน
            </p>
          )}
        </div>

        <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4">
          <p className="text-xs text-amber-400 mb-1">Weak Leg ({weakSide})</p>
          <p className="text-2xl font-bold text-amber-400">{weakLeg.toLocaleString()}</p>
          <p className="text-xs text-amber-700 mt-1">฿{bvToThb(weakLeg).toLocaleString()}</p>
          <p className="text-xs text-amber-800 mt-0.5">
            ต้องเพิ่ม {(Math.max(leftVol, rightVol) - weakLeg).toLocaleString()} BV เพื่อ balance
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Vol เดือนนี้ ซ้าย / ขวา</p>
          <div className="flex items-end gap-2 mt-1">
            <div>
              <p className="text-xs text-sky-500">ซ้าย</p>
              <p className="text-xl font-bold text-sky-400">{latestLR.currLeft.toLocaleString()}</p>
            </div>
            <p className="text-slate-600 text-lg mb-0.5">/</p>
            <div>
              <p className="text-xs text-purple-500">ขวา</p>
              <p className="text-xl font-bold text-purple-400">{latestLR.currRight.toLocaleString()}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            ฿{bvToThb(latestLR.currLeft).toLocaleString()} / ฿{bvToThb(latestLR.currRight).toLocaleString()}
          </p>
        </div>
      </div>

      {/* ── L/R balance bar ── */}
      {totalVol > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-400">สัดส่วน Vol สะสม ซ้าย / ขวา</p>
            <p className="text-xs text-amber-400">Weak Leg: {weakSide} ({weakLeg.toLocaleString()} BV)</p>
          </div>
          <div className="flex rounded-full overflow-hidden h-5">
            <div
              className="bg-sky-500 flex items-center justify-center text-xs text-white font-medium"
              style={{ width: `${leftPct}%` }}
            >
              {Number(leftPct) > 12 ? `${leftPct}%` : ''}
            </div>
            <div
              className="bg-purple-500 flex items-center justify-center text-xs text-white font-medium flex-1"
            >
              {Number(rightPct) > 12 ? `${rightPct}%` : ''}
            </div>
          </div>
          <div className="flex justify-between text-xs mt-1.5">
            <span className="text-sky-400">ซ้าย {leftVol.toLocaleString()} BV · ฿{bvToThb(leftVol).toLocaleString()}</span>
            <span className="text-purple-400">ขวา {rightVol.toLocaleString()} BV · ฿{bvToThb(rightVol).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* ── Charts row 1 ── */}
      <div className="grid md:grid-cols-2 gap-4">
        <GrowthChart summaries={summaries} lrData={lrByMonth} />
        <BvChart summaries={summaries} lrData={lrByMonth} />
      </div>

      {/* ── Charts row 2 ── */}
      <div className="grid md:grid-cols-2 gap-4">
        <PositionDonut
          counts={latest.position_counts}
          latestLR={{ left: leftVol, right: rightVol }}
          totalMembers={latest.total_members}
          activeMembers={latest.active_members}
        />

        {/* Monthly summary table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">สรุปรายเดือน</h2>
          <div className="overflow-auto max-h-64">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-left pb-2 pr-3">เดือน</th>
                  <th className="text-right pb-2 pr-3">สมาชิก</th>
                  <th className="text-right pb-2 pr-3">Active</th>
                  <th className="text-right pb-2 pr-3">BV</th>
                  <th className="text-right pb-2 pr-3 text-sky-400">Vol ซ้าย</th>
                  <th className="text-right pb-2 text-purple-400">Vol ขวา</th>
                </tr>
              </thead>
              <tbody>
                {[...summaries].reverse().map((s, i) => {
                  const lr = lrByMonth.find((d) => d.month === s.month)
                  return (
                    <tr key={s.month} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="py-1.5 pr-3 text-slate-300">{s.month}</td>
                      <td className="text-right pr-3 text-white">{s.total_members}</td>
                      <td className="text-right pr-3 text-green-400">{s.active_members}</td>
                      <td className="text-right pr-3 text-purple-400">{s.total_bv.toLocaleString()}</td>
                      <td className="text-right pr-3 text-sky-400">{(lr?.left ?? 0).toLocaleString()}</td>
                      <td className="text-right text-purple-400">{(lr?.right ?? 0).toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  )
}
