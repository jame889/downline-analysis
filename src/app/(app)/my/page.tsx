'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import PositionBadge from '@/components/PositionBadge'
import VolLRChart from '@/components/VolLRChart'
import Link from 'next/link'

interface AnalyzeNode {
  id: string
  name: string
  level: number
  depth: number
  highest_position: string
  is_active: boolean
  monthly_bv: number
  total_vol_left: number
  total_vol_right: number
}

interface HistoryRow {
  month: string
  level: number
  highest_position: string
  is_active: boolean
  is_qualified: boolean
  monthly_bv: number
  monthly_thb: number
  total_vol_left: number
  total_vol_right: number
  vol_left_thb: number
  vol_right_thb: number
  weak_leg_bv: number
  weak_leg_thb: number
}

interface SponsoredRow {
  id: string
  name: string
  join_date: string
  position: string
  is_active: boolean
  is_qualified: boolean
  monthly_bv: number
  monthly_thb: number
  total_vol_left: number
  total_vol_right: number
  level: number
}

interface Report {
  highest_position: string
  income_position: string
  is_active: boolean
  is_qualified: boolean
  monthly_bv: number
  monthly_thb: number
  total_vol_left: number
  total_vol_right: number
  vol_left_thb: number
  vol_right_thb: number
  weak_leg_bv: number
  weak_leg_thb: number
  level: number
}

interface Member { id: string; name: string; join_date: string; lv: number }

interface OrgStats { total: number; active: number; qualified: number; total_bv: number }

interface TreeNode {
  id: string
  name: string
  upline_id: string | null
  level: number
  highest_position: string
  is_active: number
  monthly_bv: number
}

interface KeymanRankGap {
  label: 'Star' | 'Bronze' | 'Silver'
  progressPct: number
  leftGap: number
  rightGap: number
  activeLeftGap: number
  activeRightGap: number
  starLeftGap: number
  starRightGap: number
}

interface KeymanRow {
  id: string
  name: string
  side: 'ซ้าย' | 'ขวา' | 'ไม่ทราบ'
  leftBv: number
  rightBv: number
  closestRank: KeymanRankGap | null
  bottlenecks: string[]
  recommendedAction: string
  concentrationPct: number
  concentrationMemberId: string | null
  concentrationMemberName: string | null
  focusMemberId: string | null
  focusMemberName: string | null
  weakSide: 'ซ้าย' | 'ขวา'
  opportunityScore: number
  newBv: number
}

interface KeymanStructure {
  left: KeymanRow[]
  right: KeymanRow[]
  unknown: KeymanRow[]
}

function keymanGapText(item: KeymanRow): string[] {
  const gap = item.closestRank
  if (!gap) return ['ผ่านระดับ Silver แล้ว']
  const parts: string[] = []
  if (gap.leftGap > 0) parts.push(`ขาดฝั่งซ้ายอีก ${gap.leftGap.toLocaleString()} คะแนน`)
  if (gap.rightGap > 0) parts.push(`ขาดฝั่งขวาอีก ${gap.rightGap.toLocaleString()} คะแนน`)
  if (gap.activeLeftGap > 0) parts.push(`ขาด Active FA ฝั่งซ้าย ${gap.activeLeftGap} คน`)
  if (gap.activeRightGap > 0) parts.push(`ขาด Active FA ฝั่งขวา ${gap.activeRightGap} คน`)
  if (gap.starLeftGap > 0) parts.push(`ขาด Star ฝั่งซ้าย ${gap.starLeftGap} คน`)
  if (gap.starRightGap > 0) parts.push(`ขาด Star ฝั่งขวา ${gap.starRightGap} คน`)
  return parts.length ? parts : [`รอยืนยันตำแหน่ง ${gap.label}`]
}

function keymanBottleneck(item: KeymanRow): string {
  if (item.concentrationPct >= 50 && item.concentrationMemberName && item.concentrationMemberId) {
    return `${item.concentrationPct}% ของ New BV มาจาก ${item.concentrationMemberName} (${item.concentrationMemberId}) คนเดียว`
  }
  return item.bottlenecks[0] ?? 'ยังไม่พบคอขวดเด่น'
}

function keymanAction(item: KeymanRow): string {
  if (!item.focusMemberName || !item.focusMemberId) return item.recommendedAction
  const starGap = (item.closestRank?.starLeftGap ?? 0) + (item.closestRank?.starRightGap ?? 0)
  return `เร่ง Start Up ใต้ ${item.focusMemberName} (${item.focusMemberId})${starGap > 0
    ? ` และสร้าง Star ใหม่ในสาย${item.weakSide}`
    : ` พร้อมเติมคะแนนสาย${item.weakSide}`}`
}

const RANK_ORDER = [
  'CR. Ambassador', 'Crown Royal', 'Crown',
  'Red Diamond', 'Blue Diamond', 'Diamond',
  'Ruby', 'Platinum', 'Gold', 'Silver', 'Bronze', 'Star', 'FA',
]

function rankIndex(pos: string) {
  const i = RANK_ORDER.indexOf(pos)
  return i === -1 ? RANK_ORDER.length : i
}


/** Client-side equivalent of analyzeDownline — no API call needed. */
function buildTeamFocusClientSide(
  focusId: string,
  treeNodes: TreeNode[],
): { left: AnalyzeNode[]; right: AnalyzeNode[] } {
  const nodeMap = new Map<string, TreeNode>()
  for (const n of treeNodes) nodeMap.set(n.id, n)

  const childMap = new Map<string, string[]>()
  childMap.set(focusId, [])

  // Process level-ascending so closer-to-root nodes are placed first
  const sorted = treeNodes.filter((n) => n.id !== focusId).sort((a, b) => a.level - b.level)

  for (const n of sorted) {
    let curr: string | null = n.upline_id
    let parentId: string | null = null
    while (curr) {
      if (curr === focusId || childMap.has(curr)) {
        parentId = curr
        break
      }
      // Walk up via treeNodes — never use sponsor_id
      const currNode = nodeMap.get(curr)
      if (!currNode) break
      curr = currNode.upline_id
    }
    if (parentId) {
      const arr = childMap.get(parentId) ?? []
      arr.push(n.id)
      childMap.set(parentId, arr)
    }
  }

  const directKids = childMap.get(focusId) ?? []
  const leftRootId  = directKids[0] ?? null
  const rightRootId = directKids[1] ?? null

  function collectSubtree(startId: string | null): AnalyzeNode[] {
    if (!startId) return []
    const result: AnalyzeNode[] = []
    const queue: [string, number][] = [[startId, 0]]
    while (queue.length) {
      const [id, depth] = queue.shift()!
      const node = nodeMap.get(id)
      if (node) {
        result.push({
          id:               node.id,
          name:             node.name,
          level:            node.level,
          depth,
          highest_position: node.highest_position,
          is_active:        node.is_active === 1,
          monthly_bv:       node.monthly_bv,
          total_vol_left:   0,
          total_vol_right:  0,
        })
        for (const childId of childMap.get(id) ?? []) queue.push([childId, depth + 1])
      }
    }
    return result
  }

  return {
    left:  collectSubtree(leftRootId),
    right: collectSubtree(rightRootId),
  }
}

function getLegMembers(myId: string, nodes: TreeNode[]): { left: TreeNode[]; right: TreeNode[] } {
  const nodeMap = new Map<string, TreeNode>()
  for (const n of nodes) nodeMap.set(n.id, n)

  const childMap = new Map<string, TreeNode[]>()
  childMap.set(myId, [])  // ensure root is in map

  // Process level-ascending so closer-to-root nodes are placed first
  const sorted = [...nodes].filter((n) => n.id !== myId).sort((a, b) => a.level - b.level)

  for (const n of sorted) {
    // Walk UP the upline chain to find nearest ancestor already in childMap.
    // Bug 3 fix: when upline not yet placed, keep walking up through treeNodes
    // (never use sponsor_id — upline chain only).
    let curr: string | null = n.upline_id
    let parentId: string | null = null

    while (curr) {
      if (curr === myId || childMap.has(curr)) {
        parentId = curr
        break
      }
      // curr not placed yet — walk up via its own upline_id in treeNodes
      const currNode = nodeMap.get(curr)
      if (!currNode) break  // not in subtree at all
      curr = currNode.upline_id
    }

    if (parentId) {
      const arr = childMap.get(parentId) ?? []
      arr.push(n)
      childMap.set(parentId, arr)
    }
  }

  const directKids = childMap.get(myId) ?? []
  const leftRootId  = directKids[0]?.id ?? null
  const rightRootId = directKids[1]?.id ?? null

  // Bug 2 fix: BFS order = closest to root first
  function subtree(rootId: string | null): TreeNode[] {
    if (!rootId) return []
    const result: TreeNode[] = []
    const queue = [rootId]
    while (queue.length) {
      const id = queue.shift()!
      const node = nodeMap.get(id)
      if (node) {
        result.push(node)
        for (const c of childMap.get(id) ?? []) queue.push(c.id)
      }
    }
    return result
  }

  return { left: subtree(leftRootId), right: subtree(rightRootId) }
}

export default function MyPage() {
  const [months, setMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [member, setMember] = useState<Member | null>(null)
  const [myReport, setMyReport] = useState<Report | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [directSponsored, setDirectSponsored] = useState<SponsoredRow[]>([])
  const [orgStats, setOrgStats] = useState<OrgStats | null>(null)
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([])
  const [keymanStructure, setKeymanStructure] = useState<KeymanStructure | null>(null)
  const [showAllKeymen, setShowAllKeymen] = useState(false)
  const [loading, setLoading] = useState(true)

  // Sub-view: "ดูผังทีมงานนี้"
  const [focusMemberId, setFocusMemberId] = useState<string | null>(null)
  const [focusMemberName, setFocusMemberName] = useState<string>('')
  const [teamFocus, setTeamFocus] = useState<{ left: AnalyzeNode[]; right: AnalyzeNode[] } | null>(null)

  function fetchData(month: string) {
    setLoading(true)
    fetch(`/api/my?month=${month}`)
      .then((r) => r.json())
      .then((d) => {
        setMember(d.member)
        setMyReport(d.myReport)
        setHistory(d.history ?? [])
        setDirectSponsored(d.directSponsored ?? [])
        setOrgStats(d.orgStats)
        setTreeNodes(d.treeNodes ?? [])
        setKeymanStructure(d.keymanStructure ?? null)
        if (!selectedMonth) setMonths(d.months ?? [])
        setLoading(false)
        setShowAllKeymen(false)
        // Close sub-view when month changes
        setFocusMemberId(null)
        setTeamFocus(null)
      })
  }

  function handleViewTeam(memberId: string, memberName: string) {
    if (focusMemberId === memberId) {
      // Toggle off
      setFocusMemberId(null)
      setTeamFocus(null)
      return
    }
    setFocusMemberId(memberId)
    setFocusMemberName(memberName)
    // Compute client-side from already-loaded treeNodes (no API call needed)
    const result = buildTeamFocusClientSide(memberId, treeNodes)
    setTeamFocus(result)
  }

  useEffect(() => {
    fetch('/api/my')
      .then((r) => r.json())
      .then((d) => {
        setMember(d.member)
        setMyReport(d.myReport)
        setHistory(d.history ?? [])
        setDirectSponsored(d.directSponsored ?? [])
        setOrgStats(d.orgStats)
        setTreeNodes(d.treeNodes ?? [])
        setKeymanStructure(d.keymanStructure ?? null)
        setMonths(d.months ?? [])
        setSelectedMonth(d.month ?? '')
        setLoading(false)
      })
  }, [])

  const lrChartData = history.map((r) => ({
    month: r.month.slice(2),
    left: r.total_vol_left,
    right: r.total_vol_right,
  }))

  const bvChartData = history.map((r) => ({
    month: r.month.slice(2),
    BV: r.monthly_bv,
    'มูลค่า (฿)': r.monthly_thb,
    'Weak Leg': r.weak_leg_bv,
  }))

  const legLeaders = useMemo(() => {
    if (!member?.id || !treeNodes.length) return { left: [], right: [] }
    const { left, right } = getLegMembers(member.id, treeNodes)
    const filter = (nodes: TreeNode[]) =>
      nodes
        .filter((n) => n.highest_position !== 'FA' && n.is_active === 1)
        .sort((a, b) => rankIndex(a.highest_position) - rankIndex(b.highest_position))
    return { left: filter(left), right: filter(right) }
  }, [member, treeNodes])

  const keymen = useMemo(() => keymanStructure
    ? [...keymanStructure.left, ...keymanStructure.right, ...keymanStructure.unknown]
      .sort((a, b) => b.opportunityScore - a.opportunityScore || b.newBv - a.newBv)
    : [], [keymanStructure])
  const visibleKeymen = showAllKeymen ? keymen : keymen.slice(0, 20)

  if (loading) return <div className="text-slate-400 py-16 text-center">กำลังโหลด...</div>

  const leftPct = myReport && (myReport.total_vol_left + myReport.total_vol_right) > 0
    ? (myReport.total_vol_left / (myReport.total_vol_left + myReport.total_vol_right) * 100).toFixed(1)
    : '0'
  const rightPct = myReport && (myReport.total_vol_left + myReport.total_vol_right) > 0
    ? (myReport.total_vol_right / (myReport.total_vol_left + myReport.total_vol_right) * 100).toFixed(1)
    : '0'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {member?.name ?? '—'}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {member?.id} · สมัคร {member?.join_date} · LV {member?.lv?.toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {myReport && <PositionBadge pos={myReport.highest_position} />}
          <select
            value={selectedMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); fetchData(e.target.value) }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {months.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Top stats */}
      {myReport && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">BV เดือนนี้</p>
            <p className="text-2xl font-bold text-brand-400">{myReport.monthly_bv.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">฿{myReport.monthly_thb.toLocaleString()}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">สถานะ</p>
            <p className="font-medium text-sm mt-1">
              <span className={myReport.is_active ? 'text-green-400' : 'text-slate-500'}>
                {myReport.is_active ? '● Active' : '○ Inactive'}
              </span>
              <span className="text-slate-600 mx-1.5">·</span>
              <span className={myReport.is_qualified ? 'text-blue-400' : 'text-slate-500'}>
                {myReport.is_qualified ? 'Qualified' : 'Unqualified'}
              </span>
            </p>
          </div>

          {/* Left leg */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Vol สะสม ซ้าย ({leftPct}%)</p>
            <p className="text-2xl font-bold text-sky-400">{myReport.total_vol_left.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">฿{myReport.vol_left_thb.toLocaleString()}</p>
          </div>

          {/* Right leg */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Vol สะสม ขวา ({rightPct}%)</p>
            <p className="text-2xl font-bold text-purple-400">{myReport.total_vol_right.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">฿{myReport.vol_right_thb.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Weak leg + org stats row */}
      {myReport && orgStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4">
            <p className="text-xs text-amber-400 mb-1">Weak Leg (สาขาที่น้อยกว่า)</p>
            <p className="text-2xl font-bold text-amber-400">{myReport.weak_leg_bv.toLocaleString()}</p>
            <p className="text-xs text-amber-700 mt-1">฿{myReport.weak_leg_thb.toLocaleString()}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">สมาชิกในองค์กร</p>
            <p className="text-2xl font-bold text-white">{orgStats.total}</p>
            <p className="text-xs text-green-500 mt-1">Active {orgStats.active}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">ผู้ได้รับการ Sponsor ตรง</p>
            <p className="text-2xl font-bold text-white">{directSponsored.length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">BV รวมองค์กร</p>
            <p className="text-2xl font-bold text-purple-400">{orgStats.total_bv.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">฿{(orgStats.total_bv * 50).toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* L/R balance bar */}
      {myReport && (myReport.total_vol_left + myReport.total_vol_right) > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs text-slate-400 mb-3">สัดส่วน Vol ซ้าย / ขวา (สะสม)</p>
          <div className="flex rounded-full overflow-hidden h-5">
            <div
              className="bg-sky-500 flex items-center justify-center text-xs text-white font-medium"
              style={{ width: `${leftPct}%` }}
            >
              {Number(leftPct) > 10 ? `${leftPct}%` : ''}
            </div>
            <div
              className="bg-purple-500 flex items-center justify-center text-xs text-white font-medium"
              style={{ width: `${rightPct}%` }}
            >
              {Number(rightPct) > 10 ? `${rightPct}%` : ''}
            </div>
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1.5">
            <span className="text-sky-400">ซ้าย {myReport.total_vol_left.toLocaleString()} BV</span>
            <span className="text-purple-400">ขวา {myReport.total_vol_right.toLocaleString()} BV</span>
          </div>
        </div>
      )}

      {/* Charts */}
      {lrChartData.length > 1 && (
        <div className="grid md:grid-cols-2 gap-4">
          <VolLRChart data={lrChartData} title="Vol สะสม ซ้าย / ขวา รายเดือน" />

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">BV และมูลค่า (฿) รายเดือน</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={bvChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                  formatter={(v: number) => v.toLocaleString()}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="BV" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Weak Leg" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* History table */}
      {history.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-300">ประวัติรายเดือน</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-left px-4 py-3">เดือน</th>
                  <th className="text-left px-4 py-3">ตำแหน่ง</th>
                  <th className="text-center px-4 py-3">Active</th>
                  <th className="text-right px-4 py-3">BV</th>
                  <th className="text-right px-4 py-3">มูลค่า (฿)</th>
                  <th className="text-right px-4 py-3">Vol ซ้าย</th>
                  <th className="text-right px-4 py-3">฿ ซ้าย</th>
                  <th className="text-right px-4 py-3">Vol ขวา</th>
                  <th className="text-right px-4 py-3">฿ ขวา</th>
                  <th className="text-right px-4 py-3">Weak Leg</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((r) => (
                  <tr key={r.month} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                    <td className="px-4 py-2 text-slate-300">{r.month}</td>
                    <td className="px-4 py-2"><PositionBadge pos={r.highest_position} /></td>
                    <td className="px-4 py-2 text-center">
                      <span className={r.is_active ? 'text-green-400' : 'text-slate-600'}>{r.is_active ? '●' : '○'}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-white">{r.monthly_bv}</td>
                    <td className="px-4 py-2 text-right text-amber-400">฿{r.monthly_thb.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-sky-400">{r.total_vol_left.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-sky-700">฿{r.vol_left_thb.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-purple-400">{r.total_vol_right.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-purple-700">฿{r.vol_right_thb.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-amber-500">{r.weak_leg_bv.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Keyman placement report */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-200">Keyman ใน Placement</h2>
          <span className="text-xs text-slate-500">{keymen.length} คน · {selectedMonth}</span>
        </div>
        {keymen.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500 text-center">ยังไม่มี Keyman ที่มีผลงานในเดือนนี้</p>
        ) : (
          <>
            <div className="divide-y divide-slate-800 md:hidden">
              {visibleKeymen.map((item) => (
                <article key={item.id} className="px-4 py-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/members/${item.id}`} className="font-medium text-sm text-slate-100 hover:text-brand-400">
                      {item.name} <span className="font-mono text-xs text-brand-400">({item.id})</span>
                    </Link>
                    <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded border ${item.side === 'ซ้าย'
                      ? 'text-sky-300 border-sky-800 bg-sky-950/40'
                      : item.side === 'ขวา'
                        ? 'text-fuchsia-300 border-fuchsia-800 bg-fuchsia-950/30'
                        : 'text-slate-400 border-slate-700 bg-slate-800'}`}>
                      ฝั่ง{item.side}
                    </span>
                  </div>
                  <p className="text-sm">
                    <span className="text-slate-400">คะแนนซ้าย </span>
                    <span className="text-sky-400 font-semibold">{item.leftBv.toLocaleString()}</span>
                    <span className="text-slate-600 mx-2">|</span>
                    <span className="text-slate-400">คะแนนขวา </span>
                    <span className="text-fuchsia-400 font-semibold">{item.rightBv.toLocaleString()}</span>
                  </p>
                  <p className="text-sm font-medium text-slate-200">
                    {item.closestRank
                      ? `ใกล้ตำแหน่ง ${item.closestRank.label} (${item.closestRank.progressPct}%)`
                      : 'ผ่านตำแหน่ง Silver แล้ว'}
                  </p>
                  <div className="space-y-1 text-xs text-amber-300">
                    {keymanGapText(item).map((text) => <p key={text}>{text}</p>)}
                  </div>
                  <p className="text-xs leading-5 text-slate-300">
                    <span className="text-slate-500">จุดติดขัด: </span>{keymanBottleneck(item)}
                  </p>
                  <p className="text-xs leading-5 text-emerald-300">
                    <span className="text-slate-500">คำแนะนำ: </span>{keymanAction(item)}
                  </p>
                </article>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-800">
                  <th className="text-left px-4 py-3 w-64">Keyman</th>
                  <th className="text-left px-4 py-3 w-48">คะแนนซ้าย / ขวา</th>
                  <th className="text-left px-4 py-3 w-64">เป้าหมายและ Gap</th>
                  <th className="text-left px-4 py-3 min-w-[18rem]">จุดติดขัด</th>
                  <th className="text-left px-4 py-3 min-w-[20rem]">คำแนะนำ</th>
                </tr>
              </thead>
              <tbody>
                {visibleKeymen.map((item) => (
                  <tr key={item.id} className="border-b border-slate-800/60 align-top hover:bg-slate-800/25 transition-colors">
                    <td className="px-4 py-4">
                      <Link href={`/members/${item.id}`} className="font-medium text-slate-100 hover:text-brand-400">
                        {item.name}
                      </Link>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="font-mono text-xs text-brand-400">{item.id}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${item.side === 'ซ้าย'
                          ? 'text-sky-300 border-sky-800 bg-sky-950/40'
                          : item.side === 'ขวา'
                            ? 'text-fuchsia-300 border-fuchsia-800 bg-fuchsia-950/30'
                            : 'text-slate-400 border-slate-700 bg-slate-800'}`}>
                          ฝั่ง{item.side}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sky-400 font-semibold">{item.leftBv.toLocaleString()}</span>
                      <span className="text-slate-600 mx-2">|</span>
                      <span className="text-fuchsia-400 font-semibold">{item.rightBv.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-slate-200 font-medium">
                        {item.closestRank
                          ? `ใกล้ตำแหน่ง ${item.closestRank.label} (${item.closestRank.progressPct}%)`
                          : 'ผ่านตำแหน่ง Silver แล้ว'}
                      </p>
                      <div className="mt-1.5 space-y-1 text-xs text-amber-300">
                        {keymanGapText(item).map((text) => <p key={text}>{text}</p>)}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs leading-5 text-slate-300">
                      {keymanBottleneck(item)}
                    </td>
                    <td className="px-4 py-4 text-xs leading-5 text-emerald-300">
                      {keymanAction(item)}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            {keymen.length > 20 && (
              <div className="px-4 py-3 border-t border-slate-800 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowAllKeymen((value) => !value)}
                  className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                >
                  {showAllKeymen ? 'แสดง 20 คนแรก' : `แสดงทั้งหมด ${keymen.length} คน`}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Leg Leaders */}
      {(legLeaders.left.length > 0 || legLeaders.right.length > 0) && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-300">ผู้นำในสายงาน (Active)</h2>
          </div>
          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
            {/* Left leg */}
            <div className="p-4">
              <p className="text-xs font-semibold text-sky-400 mb-3">← ขาซ้าย ({legLeaders.left.length} คน)</p>
              {legLeaders.left.length === 0 ? (
                <p className="text-xs text-slate-500">ไม่มีผู้นำ active</p>
              ) : (
                <div className="space-y-1.5">
                  {legLeaders.left.map((n) => (
                    <div key={n.id} className="flex items-center gap-2">
                      <PositionBadge pos={n.highest_position} />
                      <Link href={`/members/${n.id}`} className="text-xs text-slate-300 hover:text-brand-400 truncate flex-1">
                        {n.name}
                      </Link>
                      {n.monthly_bv > 0 && (
                        <span className="text-xs text-slate-500 shrink-0">{n.monthly_bv.toLocaleString()} BV</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Right leg */}
            <div className="p-4">
              <p className="text-xs font-semibold text-purple-400 mb-3">ขาขวา → ({legLeaders.right.length} คน)</p>
              {legLeaders.right.length === 0 ? (
                <p className="text-xs text-slate-500">ไม่มีผู้นำ active</p>
              ) : (
                <div className="space-y-1.5">
                  {legLeaders.right.map((n) => (
                    <div key={n.id} className="flex items-center gap-2">
                      <PositionBadge pos={n.highest_position} />
                      <Link href={`/members/${n.id}`} className="text-xs text-slate-300 hover:text-brand-400 truncate flex-1">
                        {n.name}
                      </Link>
                      {n.monthly_bv > 0 && (
                        <span className="text-xs text-slate-500 shrink-0">{n.monthly_bv.toLocaleString()} BV</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Personally sponsored members */}
      {directSponsored.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-300">ผู้ได้รับการ Sponsor ตรง ({directSponsored.length} คน)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs border-b border-slate-800">
                  <th className="text-left px-4 py-3">รหัส / ชื่อ</th>
                  <th className="text-left px-4 py-3">วันที่สมัคร</th>
                  <th className="text-left px-4 py-3">ตำแหน่ง</th>
                  <th className="text-center px-4 py-3">Active</th>
                  <th className="text-right px-4 py-3">BV</th>
                  <th className="text-right px-4 py-3">มูลค่า (฿)</th>
                  <th className="text-right px-4 py-3">Vol ซ้าย</th>
                  <th className="text-right px-4 py-3">Vol ขวา</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {directSponsored.map((d) => (
                  <tr key={d.id} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${focusMemberId === d.id ? 'bg-slate-800/40' : ''}`}>
                    <td className="px-4 py-2.5">
                      <Link href={`/members/${d.id}`} className="hover:text-brand-400">
                        <span className="text-brand-400 font-mono text-xs">{d.id}</span>
                        <span className="text-slate-300 ml-2">{d.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{d.join_date}</td>
                    <td className="px-4 py-2.5"><PositionBadge pos={d.position} /></td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={d.is_active ? 'text-green-400' : 'text-slate-600'}>
                        {d.is_active ? '●' : '○'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-white">{d.monthly_bv.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-amber-400">฿{d.monthly_thb.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-sky-400">{d.total_vol_left.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-purple-400">{d.total_vol_right.toLocaleString()}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => handleViewTeam(d.id, d.name)}
                        className={`text-xs px-2 py-1 rounded-lg border transition-colors whitespace-nowrap
                          ${focusMemberId === d.id
                            ? 'bg-brand-900/40 border-brand-600 text-brand-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'}`}
                      >
                        {focusMemberId === d.id ? '▲ ซ่อน' : 'ดูผังทีมงานนี้'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Team Focus sub-view ─────────────────────────────────────────────── */}
      {focusMemberId && (
        <div className="bg-slate-900 border border-brand-800/50 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-300">
                ผังทีมงาน: <span className="text-brand-400">{focusMemberName}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Left / Right Team Focus — เรียงจากใกล้ root ไปไกล</p>
            </div>
            <button
              onClick={() => { setFocusMemberId(null); setTeamFocus(null) }}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              ✕ ปิด
            </button>
          </div>

          {teamFocus ? (
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
              {/* Left Team Focus */}
              <div className="p-4">
                <p className="text-xs font-semibold text-sky-400 mb-3">
                  ← ทีมซ้าย ({teamFocus.left.length} คน)
                </p>
                {teamFocus.left.length === 0 ? (
                  <p className="text-xs text-slate-500">ไม่มีสมาชิก</p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {teamFocus.left.map((n) => (
                      <div key={n.id} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-600 w-4 shrink-0">{n.depth}</span>
                        <PositionBadge pos={n.highest_position} />
                        <Link href={`/members/${n.id}`} className="text-slate-300 hover:text-brand-400 truncate flex-1">
                          {n.name}
                        </Link>
                        <span className={`shrink-0 ${n.is_active ? 'text-green-400' : 'text-slate-600'}`}>
                          {n.is_active ? '●' : '○'}
                        </span>
                        <span className="text-slate-500 shrink-0">{n.monthly_bv.toLocaleString()} BV</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-sky-700 mt-3">
                  Vol ซ้ายรวม: <span className="text-sky-400 font-medium">
                    {teamFocus.left.reduce((s, n) => s + n.monthly_bv, 0).toLocaleString()} BV
                  </span>
                </p>
              </div>

              {/* Right Team Focus */}
              <div className="p-4">
                <p className="text-xs font-semibold text-purple-400 mb-3">
                  ทีมขวา → ({teamFocus.right.length} คน)
                </p>
                {teamFocus.right.length === 0 ? (
                  <p className="text-xs text-slate-500">ไม่มีสมาชิก</p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {teamFocus.right.map((n) => (
                      <div key={n.id} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-600 w-4 shrink-0">{n.depth}</span>
                        <PositionBadge pos={n.highest_position} />
                        <Link href={`/members/${n.id}`} className="text-slate-300 hover:text-brand-400 truncate flex-1">
                          {n.name}
                        </Link>
                        <span className={`shrink-0 ${n.is_active ? 'text-green-400' : 'text-slate-600'}`}>
                          {n.is_active ? '●' : '○'}
                        </span>
                        <span className="text-slate-500 shrink-0">{n.monthly_bv.toLocaleString()} BV</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-purple-700 mt-3">
                  Vol ขวารวม: <span className="text-purple-400 font-medium">
                    {teamFocus.right.reduce((s, n) => s + n.monthly_bv, 0).toLocaleString()} BV
                  </span>
                </p>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className="text-center">
        <Link href={`/tree?member=${member?.id}`} className="text-brand-400 text-sm hover:underline">
          ดูโครงสร้างองค์กร →
        </Link>
      </div>
    </div>
  )
}
