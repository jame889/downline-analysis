import Link from 'next/link'
import type { TeamHealthData, TeamSideHealth } from '@/lib/team-health'

function labelMonth(month: string) {
  const [year, rawMonth] = month.split('-').map(Number)
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  return `${months[rawMonth - 1]} ${year + 543}`
}

function SideCard({ data, tone }: { data: TeamSideHealth; tone: 'cyan' | 'violet' }) {
  const left = data.side === 'left'
  const accent = tone === 'cyan' ? 'text-cyan-300 border-cyan-800/50 bg-cyan-950/20' : 'text-violet-300 border-violet-800/50 bg-violet-950/20'
  return (
    <section className={`border p-5 ${accent}`}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold">ทีม{left ? 'ซ้าย' : 'ขวา'}</h2>
        <span className="text-xs text-slate-400">Placement side</span>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-5 text-sm">
        <div><p className="text-slate-400">BV สะสม</p><p className="text-2xl font-bold text-white">{data.totalBv.toLocaleString()}</p></div>
        <div><p className="text-slate-400">New BV เดือนนี้</p><p className="text-2xl font-bold text-white">{data.newBv.toLocaleString()}</p></div>
        <div><p className="text-slate-400">Active</p><p className="font-semibold text-white">{data.activeMembers.toLocaleString()} คน <span className="text-slate-500">({data.activeRate}%)</span></p></div>
        <div><p className="text-slate-400">Inactive</p><p className="font-semibold text-white">{data.inactiveMembers.toLocaleString()} คน</p></div>
        <div><p className="text-slate-400">สมาชิกใหม่</p><p className="font-semibold text-white">{data.newMembers.toLocaleString()} คน</p></div>
        <div><p className="text-slate-400">เสี่ยงต้องติดตาม</p><p className="font-semibold text-amber-300">{data.atRiskMembers.toLocaleString()} คน</p></div>
      </div>
      <p className="mt-5 border-t border-slate-800 pt-3 text-xs text-slate-500">CV และจำนวน Order: ยังไม่มีในชุด Business Report ที่ระบบบรรจุอยู่</p>
    </section>
  )
}

export default function MonthlyTeamHealth({ data, memberId, isAdmin }: { data: TeamHealthData; memberId: string; isAdmin: boolean }) {
  const query = isAdmin ? `&member=${encodeURIComponent(memberId)}` : ''
  const rank = data.nextRank
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Business Report source</p>
          <h1 className="mt-1 text-2xl font-bold text-white">Monthly Team Health</h1>
          <p className="mt-1 text-sm text-slate-400">{data.member.name} ({data.member.id}) · เดือน {labelMonth(data.month)} · ข้อมูลจาก Business Report ไม่ใช่การเชื่อมต่อ First Direct แบบสด</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.availableMonths.slice(0, 6).map((month) => (
            <Link key={month} href={`/team-health?month=${month}${query}`} className={`px-3 py-1.5 text-xs ${month === data.month ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
              {labelMonth(month)}
            </Link>
          ))}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Balance Strength</p><p className="mt-1 text-2xl font-bold text-white">{data.balanceRatio}%</p></div>
        <div className="border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Weak Leg</p><p className="mt-1 text-2xl font-bold text-amber-300">ฝั่ง{data.weakSide === 'left' ? 'ซ้าย' : 'ขวา'}</p></div>
        <div className="border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">ตำแหน่งปัจจุบัน</p><p className="mt-1 text-2xl font-bold text-white">{data.member.position}</p></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <SideCard data={data.left} tone="cyan" />
        <SideCard data={data.right} tone="violet" />
      </section>

      {rank ? (
        <section className="border border-amber-800/50 bg-amber-950/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Next Rank Gap</p>
          <h2 className="mt-1 text-xl font-bold text-white">เป้าหมายถัดไป: {rank.label}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div><p className="text-slate-400">BV ที่ขาดซ้าย</p><p className="font-bold text-white">{rank.leftBvGap.toLocaleString()} BV</p></div>
            <div><p className="text-slate-400">BV ที่ขาดขวา</p><p className="font-bold text-white">{rank.rightBvGap.toLocaleString()} BV</p></div>
            <div><p className="text-slate-400">Active FA ที่ขาดซ้าย</p><p className="font-bold text-white">{rank.leftActiveGap.toLocaleString()} คน</p></div>
            <div><p className="text-slate-400">Active FA ที่ขาดขวา</p><p className="font-bold text-white">{rank.rightActiveGap.toLocaleString()} คน</p></div>
          </div>
          {rank.requiredLeader && (
            <div className="mt-5 border-t border-amber-900/50 pt-4 text-sm text-slate-300">
              <p>ผู้นำที่ต้องมี: {rank.requiredLeader} ขึ้นไป อย่างน้อยฝั่งละ 1 คน</p>
              <p className="mt-1 text-xs text-slate-400">สายเลือด Sponsor ใช้ได้ทุกชั้น G1, G2, G3... ส่วน Placement/Upline ใช้นับฝั่ง</p>
              <p className="mt-2">ซ้าย: {rank.leftQualifiedLeader ? `${rank.leftQualifiedLeader.name} (${rank.leftQualifiedLeader.id}) · G${rank.leftQualifiedLeader.sponsorDepth}` : 'ยังไม่พบ'} · ขวา: {rank.rightQualifiedLeader ? `${rank.rightQualifiedLeader.name} (${rank.rightQualifiedLeader.id}) · G${rank.rightQualifiedLeader.sponsorDepth}` : 'ยังไม่พบ'}</p>
            </div>
          )}
        </section>
      ) : <section className="border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">ไม่มีตำแหน่งถัดไปในตาราง Rank ปัจจุบัน</section>}
    </div>
  )
}
