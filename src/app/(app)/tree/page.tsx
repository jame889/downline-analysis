'use client'
import { useEffect, useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TreeNode {
  id: string
  name: string
  upline_id: string | null
  level: number
  highest_position: string
  is_active: number
  monthly_bv: number
  total_vol_left: number
  total_vol_right: number
}

interface VizNode {
  id: string
  name: string
  monthly_bv: number
  highest_position: string
  is_active: number
  total_vol_left: number
  total_vol_right: number
  subtreeCount: number
  hasChildren: boolean
  children: VizNode[]
  x: number
  y: number
  subtreeWidth: number
  depthLevel: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CARD_W = 128
const CARD_H = 82
const H_SPACING = 140
const V_SPACING = 110

const POS_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  FA: { fill: '#1e293b', stroke: '#94a3b8', text: '#cbd5e1' },
  BR: { fill: '#431407', stroke: '#f97316', text: '#fdba74' },
  ST: { fill: '#422006', stroke: '#eab308', text: '#fde047' },
  SV: { fill: '#3b0764', stroke: '#a855f7', text: '#d8b4fe' },
}

const SHORT_RANK: Record<string, string> = {
  FA: 'FA', BR: 'Bronze', ST: 'Star', SV: 'Silver',
}

function posColor(pos: string) { return POS_COLORS[pos] ?? POS_COLORS.FA }
function shortRank(pos: string) { return SHORT_RANK[pos] ?? pos }
function shortName(name: string, max = 15) {
  if (!name) return '-'
  const first = name.trim().split(/\s+/)[0]
  return first.length <= max ? first : first.slice(0, max) + '…'
}
function fmt(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return n.toLocaleString()
}

// ── Build VizNode tree ────────────────────────────────────────────────────────

function buildVizNodes(
  ids: string[],
  nodeMap: Map<string, TreeNode>,
  childMap: Map<string, TreeNode[]>,
  depth: number,
): VizNode[] {
  if (depth > 20) return []
  return ids.flatMap((id) => {
    const n = nodeMap.get(id)
    if (!n) return []
    const childIds = (childMap.get(id) ?? []).map((c) => c.id)
    const children = buildVizNodes(childIds, nodeMap, childMap, depth + 1)
    const subtreeCount = children.reduce((s, c) => s + 1 + c.subtreeCount, 0)
    return [{
      id: n.id, name: n.name, monthly_bv: n.monthly_bv,
      highest_position: n.highest_position, is_active: n.is_active,
      total_vol_left: n.total_vol_left, total_vol_right: n.total_vol_right,
      subtreeCount, hasChildren: childIds.length > 0, children,
      x: 0, y: depth, subtreeWidth: 0, depthLevel: depth,
    }]
  })
}

// ── Layout ────────────────────────────────────────────────────────────────────

function assignWidths(nodes: VizNode[]): number {
  let total = 0
  for (const n of nodes) {
    n.subtreeWidth = Math.max(1, assignWidths(n.children))
    total += n.subtreeWidth
  }
  return total
}

function assignPositions(nodes: VizNode[], offsetUnits: number, depthOffset: number) {
  let cursor = offsetUnits
  for (const n of nodes) {
    n.x = (cursor + n.subtreeWidth / 2) * H_SPACING
    n.y = (n.y + depthOffset) * V_SPACING + CARD_H / 2 + 6
    assignPositions(n.children, cursor, depthOffset)
    cursor += n.subtreeWidth
  }
}

function layoutForest(nodes: VizNode[]) {
  assignWidths(nodes)
  assignPositions(nodes, 0, 0)
}

function cloneTree(nodes: VizNode[]): VizNode[] {
  return nodes.map((n) => ({
    ...n, y: n.depthLevel, x: 0, subtreeWidth: 0,
    children: cloneTree(n.children),
  }))
}

function pruneCollapsed(nodes: VizNode[], collapsed: Set<string>) {
  for (const n of nodes) {
    if (collapsed.has(n.id)) n.children = []
    else pruneCollapsed(n.children, collapsed)
  }
}

function flatNodes(nodes: VizNode[]): VizNode[] {
  const result: VizNode[] = []
  const queue = [...nodes]
  while (queue.length) {
    const n = queue.shift()!
    result.push(n)
    queue.push(...n.children)
  }
  return result
}

function flatEdges(nodes: VizNode[]) {
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = []
  function walk(parent: VizNode) {
    for (const child of parent.children) {
      edges.push({ x1: parent.x, y1: parent.y + CARD_H / 2, x2: child.x, y2: child.y - CARD_H / 2 })
      walk(child)
    }
  }
  nodes.forEach(walk)
  return edges
}

// ── Search ────────────────────────────────────────────────────────────────────

function collectMatchIds(nodes: TreeNode[], q: string): Set<string> {
  if (!q) return new Set()
  const lower = q.toLowerCase()
  const result = new Set<string>()
  for (const n of nodes) {
    if (n.id.includes(q) || n.name.toLowerCase().includes(lower)) result.add(n.id)
  }
  return result
}

// ── SVG Card Node ─────────────────────────────────────────────────────────────

function CardNode({
  n, isHov, isCollapsed, isHighlighted, onToggle,
}: {
  n: VizNode
  isHov: boolean
  isCollapsed: boolean
  isHighlighted: boolean
  onToggle: () => void
}) {
  const active = !!n.is_active
  const c = active ? posColor(n.highest_position) : { fill: '#0f172a', stroke: '#334155', text: '#475569' }
  const rank = shortRank(n.highest_position)
  const cx = n.x - CARD_W / 2
  const cy = n.y - CARD_H / 2
  const badgeW = Math.max(34, rank.length * 5.5 + 8)

  return (
    <g style={{ cursor: 'pointer' }} opacity={active ? 1 : 0.6}>
      {/* Glow */}
      {(isHov || isHighlighted) && (
        <rect
          x={cx - 4} y={cy - 4} width={CARD_W + 8} height={CARD_H + 8} rx={12}
          fill={isHighlighted ? '#fbbf24' : c.stroke}
          opacity={isHighlighted ? 0.22 : 0.15}
        />
      )}
      {/* Card */}
      <rect
        x={cx} y={cy} width={CARD_W} height={CARD_H} rx={8}
        fill={isHighlighted ? '#2d1a00' : c.fill}
        stroke={isHighlighted ? '#fbbf24' : c.stroke}
        strokeWidth={isHighlighted ? 2 : isHov ? 1.8 : 1.2}
        strokeDasharray={active ? undefined : '3 2'}
      />
      {/* Highlight dot */}
      {isHighlighted && (
        <circle cx={cx + CARD_W - 6} cy={cy + 6} r={3.5} fill="#fbbf24" />
      )}
      {/* ID */}
      <text x={cx + 7} y={cy + 14}
        fill={active ? '#94a3b8' : '#334155'} fontSize={8.5}
        style={{ userSelect: 'none' }}>{n.id}</text>
      {/* Rank badge */}
      <rect
        x={cx + CARD_W - badgeW - 5} y={cy + 4}
        width={badgeW} height={13} rx={4}
        fill={c.stroke + '28'} stroke={c.stroke} strokeWidth={0.8}
      />
      <text
        x={cx + CARD_W - badgeW / 2 - 5} y={cy + 13.5}
        textAnchor="middle" fill={c.text}
        fontSize={7} fontWeight="600" style={{ userSelect: 'none' }}
      >{rank}</text>
      {/* Name */}
      <text x={cx + 7} y={cy + 29}
        fill={active ? 'white' : '#475569'}
        fontSize={9} fontWeight="700" style={{ userSelect: 'none' }}
      >{shortName(n.name)}</text>
      {/* BV + Status */}
      <text x={cx + 7} y={cy + 43}
        fill={active ? '#4ade80' : '#334155'} fontSize={8}
        style={{ userSelect: 'none' }}>BV: {n.monthly_bv.toLocaleString()}</text>
      <text
        x={cx + CARD_W - 6} y={cy + 43} textAnchor="end"
        fill={active ? '#4ade80' : '#ef4444'} fontSize={7.5}
        style={{ userSelect: 'none' }}>{active ? 'Active' : 'Inactive'}</text>
      {/* L / R vol */}
      <text x={cx + 7} y={cy + 56}
        fill={active ? '#38bdf8' : '#334155'} fontSize={7.5}
        style={{ userSelect: 'none' }}>L: {fmt(n.total_vol_left)}</text>
      <text x={cx + CARD_W / 2 + 4} y={cy + 56}
        fill={active ? '#c084fc' : '#334155'} fontSize={7.5}
        style={{ userSelect: 'none' }}>R: {fmt(n.total_vol_right)}</text>
      {/* Subtree count */}
      <text x={cx + 7} y={cy + 70}
        fill="#64748b" fontSize={7}
        style={{ userSelect: 'none' }}>{n.subtreeCount} คน</text>

      {/* Collapse/Expand button */}
      {n.hasChildren && (
        <g onClick={(e) => { e.stopPropagation(); onToggle() }} style={{ cursor: 'pointer' }}>
          <circle
            cx={cx + CARD_W / 2} cy={cy + CARD_H + 9} r={8}
            fill="#1e293b"
            stroke={isCollapsed ? '#4ade80' : '#475569'} strokeWidth={1.2}
          />
          <text
            x={cx + CARD_W / 2} y={cy + CARD_H + 12.5}
            textAnchor="middle"
            fill={isCollapsed ? '#4ade80' : '#94a3b8'}
            fontSize={11} fontWeight="700" style={{ userSelect: 'none' }}
          >{isCollapsed ? '+' : '−'}</text>
        </g>
      )}
    </g>
  )
}

// ── Leg SVG ───────────────────────────────────────────────────────────────────

const MIN_ZOOM = 0.25
const MAX_ZOOM = 2.0
const ZOOM_STEP = 0.15

function LegSvg({
  roots, label, color, highlightedIds,
}: {
  roots: VizNode[]
  label: string
  color: string
  highlightedIds: Set<string>
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(1)

  const { allNodes, edges, svgW, svgH } = useMemo(() => {
    if (!roots.length) return { allNodes: [], edges: [], svgW: 0, svgH: 0 }
    const cloned = cloneTree(roots)
    pruneCollapsed(cloned, collapsed)
    layoutForest(cloned)
    const all = flatNodes(cloned)
    const edges = flatEdges(cloned)
    const totalUnits = cloned.reduce((s, n) => s + n.subtreeWidth, 0)
    const svgW = Math.max(CARD_W + 16, totalUnits * H_SPACING + CARD_W)
    const maxY = all.length ? Math.max(...all.map((n) => n.y)) : 0
    return { allNodes: all, edges, svgW, svgH: maxY + CARD_H / 2 + 52 }
  }, [roots, collapsed])

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const changeZoom = (delta: number) =>
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + delta).toFixed(2))))

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      changeZoom(-e.deltaY * 0.003)
    }
  }

  const totalAll = flatNodes(cloneTree(roots))
  const activeCount = totalAll.filter((n) => !!n.is_active).length

  if (!roots.length) {
    return (
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-sm font-semibold" style={{ color }}>{label}</p>
        </div>
        <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-8 text-center text-slate-600 text-sm">
          ไม่มีสมาชิก
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2 px-1 gap-2">
        <p className="text-sm font-semibold" style={{ color }}>{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-500">
            {activeCount} active / {totalAll.length} คน
          </p>
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-1.5 py-0.5">
            <button
              onClick={() => changeZoom(-ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-base leading-none"
              title="Zoom out"
            >−</button>
            <button
              onClick={() => setZoom(1)}
              className="text-xs text-slate-400 hover:text-white w-9 text-center tabular-nums"
              title="Reset zoom"
            >{Math.round(zoom * 100)}%</button>
            <button
              onClick={() => changeZoom(ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-base leading-none"
              title="Zoom in"
            >+</button>
          </div>
        </div>
      </div>
      {/* SVG container */}
      <div
        className="bg-slate-900/50 border border-slate-700/40 rounded-xl overflow-auto"
        onWheel={handleWheel}
        style={{ maxHeight: '72vh' }}
      >
        <div style={{ width: svgW * zoom, height: svgH * zoom, position: 'relative', minWidth: '100%' }}>
          <svg
            width={svgW}
            height={svgH}
            className="block"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          >
            {/* Edges */}
            {edges.map((e, i) => (
              <path
                key={`e-${i}`}
                d={`M ${e.x1} ${e.y1} C ${e.x1} ${(e.y1 + e.y2) / 2}, ${e.x2} ${(e.y1 + e.y2) / 2}, ${e.x2} ${e.y2}`}
                stroke="#2d3f52" strokeWidth={1.5} fill="none"
              />
            ))}
            {/* Nodes */}
            {allNodes.map((n) => (
              <g
                key={n.id}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <CardNode
                  n={n}
                  isHov={hovered === n.id}
                  isCollapsed={collapsed.has(n.id)}
                  isHighlighted={highlightedIds.has(n.id)}
                  onToggle={() => toggleCollapse(n.id)}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  )
}

// ── Root Card (HTML) ──────────────────────────────────────────────────────────

function RootCard({ node }: { node: TreeNode }) {
  const active = !!node.is_active
  const c = posColor(node.highest_position)
  const rank = shortRank(node.highest_position)

  return (
    <div
      className="rounded-2xl px-5 py-4 w-60 border-2 shadow-xl"
      style={{ background: c.fill, borderColor: c.stroke, boxShadow: `0 0 20px ${c.stroke}40` }}
    >
      <div className="flex items-center justify-between mb-2">
        <Link
          href={`/members/${node.id}`}
          className="text-xs font-mono hover:underline"
          style={{ color: c.text }}
        >
          {node.id}
        </Link>
        <span
          className="text-xs font-semibold px-2.5 py-0.5 rounded-full border"
          style={{ background: c.stroke + '28', borderColor: c.stroke, color: c.text }}
        >
          {rank}
        </span>
      </div>
      <p className="text-white font-bold text-sm truncate mb-3">{node.name}</p>
      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <span className="text-green-400">BV: {node.monthly_bv.toLocaleString()}</span>
        <span className={active ? 'text-green-400' : 'text-slate-500'}>
          {active ? '● Active' : '○ Inactive'}
        </span>
        <span className="text-sky-400">L: {fmt(node.total_vol_left)}</span>
        <span className="text-purple-400">R: {fmt(node.total_vol_right)}</span>
      </div>
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex flex-wrap gap-3">
      {Object.entries(POS_COLORS).map(([pos, c]) => (
        <div key={pos} className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded border inline-block"
            style={{ background: c.stroke + '33', borderColor: c.stroke }}
          />
          <span className="text-xs" style={{ color: c.text }}>{SHORT_RANK[pos]}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded border border-dashed border-slate-500 inline-block bg-slate-900" />
        <span className="text-xs text-slate-500">Inactive</span>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function TreeContent() {
  const searchParams = useSearchParams()
  const memberParam = searchParams.get('member')

  const [months, setMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [allNodes, setAllNodes] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [activeOnly, setActiveOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetch('/api/summary')
      .then((r) => r.json())
      .then((d) => {
        setMonths(d.months ?? [])
        if (d.months?.[0]) setSelectedMonth(d.months[0])
      })
  }, [])

  useEffect(() => {
    if (!selectedMonth) return
    setLoading(true)
    const url = memberParam
      ? `/api/tree-data?month=${selectedMonth}&member=${memberParam}`
      : `/api/tree-data?month=${selectedMonth}`
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setAllNodes(d.nodes ?? [])
        setLoading(false)
      })
  }, [selectedMonth, memberParam])

  const filteredNodes = useMemo(
    () => activeOnly ? allNodes.filter((n) => !!n.is_active) : allNodes,
    [activeOnly, allNodes],
  )

  const { root, leftRoots, rightRoots } = useMemo(() => {
    if (!filteredNodes.length) return { root: null, leftRoots: [], rightRoots: [] }

    const nodeMap = new Map<string, TreeNode>()
    const childMap = new Map<string, TreeNode[]>()
    filteredNodes.forEach((n) => {
      nodeMap.set(n.id, n)
      if (n.upline_id) {
        const arr = childMap.get(n.upline_id) ?? []
        arr.push(n)
        childMap.set(n.upline_id, arr)
      }
    })

    // Find root (no upline in dataset)
    let rootNode: TreeNode | null = null
    for (const n of filteredNodes) {
      if (!n.upline_id || !nodeMap.has(n.upline_id)) { rootNode = n; break }
    }
    if (!rootNode) return { root: null, leftRoots: [], rightRoots: [] }

    const rootKids = childMap.get(rootNode.id) ?? []
    if (!rootKids.length) return { root: rootNode, leftRoots: [], rightRoots: [] }

    // Build each child's subtree, sort by size
    const legInfos = rootKids
      .map((kid) => {
        const roots = buildVizNodes([kid.id], nodeMap, childMap, 0)
        return { roots, count: flatNodes(roots).length }
      })
      .filter((l) => l.roots.length > 0)
      .sort((a, b) => b.count - a.count)

    // Largest → right leg; rest → left leg
    const rightForest = legInfos[0]?.roots ?? []
    const leftForest = legInfos.slice(1).flatMap((l) => l.roots)

    return { root: rootNode, leftRoots: leftForest, rightRoots: rightForest }
  }, [filteredNodes])

  const highlightedIds = useMemo(
    () => collectMatchIds(filteredNodes, searchQuery.trim()),
    [filteredNodes, searchQuery],
  )

  const activeCount = allNodes.filter((n) => !!n.is_active).length
  const matchCount = highlightedIds.size

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">ผังโครงสร้าง Downline</h1>
          {!loading && root && (
            <p className="text-slate-400 text-xs mt-1">
              {allNodes.length} คน · {activeCount} Active · คลิก +/− ใต้ card เพื่อขยาย/ยุบ
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหา ID หรือชื่อ..."
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 w-44 focus:outline-none focus:border-yellow-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
              >✕</button>
            )}
          </div>
          {searchQuery.trim() && (
            <span className={`text-xs px-2 py-1 rounded-full border shrink-0 ${
              matchCount > 0
                ? 'border-yellow-600 text-yellow-400 bg-yellow-900/20'
                : 'border-slate-700 text-slate-500'
            }`}>
              {matchCount > 0 ? `พบ ${matchCount} คน` : 'ไม่พบ'}
            </span>
          )}
          <button
            onClick={() => setActiveOnly(!activeOnly)}
            className={`text-sm px-3 py-2 rounded-lg border transition-colors font-medium
              ${activeOnly
                ? 'bg-green-900/40 border-green-700 text-green-400'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}
          >
            {activeOnly ? '● Active เท่านั้น' : '○ Active เท่านั้น'}
            <span className="ml-1.5 text-xs opacity-60">({activeCount})</span>
          </button>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {months.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400 py-16 text-center">กำลังโหลด...</p>
      ) : !root ? (
        <p className="text-slate-400 py-16 text-center">ไม่พบข้อมูล</p>
      ) : (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
          {/* Top bar: legend + hint */}
          <div className="px-5 py-3 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
            <Legend />
            <p className="text-xs text-slate-600">คลิก +/− ใต้ card เพื่อขยาย/ยุบ · เลื่อนซ้าย/ขวาได้</p>
          </div>

          <div className="p-5 overflow-x-auto">
            {/* Root node centered */}
            <div className="flex justify-center mb-0 relative z-10">
              <RootCard node={root} />
            </div>

            {/* Vertical stem */}
            <div className="flex justify-center">
              <div className="w-px h-6 bg-slate-600" />
            </div>

            {/* Two legs */}
            <div className="flex gap-4 items-start">
              <LegSvg
                roots={leftRoots}
                label="← ขาซ้าย"
                color="#38bdf8"
                highlightedIds={highlightedIds}
              />
              <LegSvg
                roots={rightRoots}
                label="ขาขวา →"
                color="#c084fc"
                highlightedIds={highlightedIds}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TreePage() {
  return (
    <Suspense fallback={<p className="text-slate-400 py-12 text-center">กำลังโหลด...</p>}>
      <TreeContent />
    </Suspense>
  )
}
