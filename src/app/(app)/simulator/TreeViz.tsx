'use client'
import { useMemo, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TreeNode {
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
  children: VizNode[]
  // layout
  x: number
  y: number
  subtreeWidth: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CARD_W = 116
const CARD_H = 74
const H_SPACING = 124   // horizontal space per "unit" of subtree width
const V_SPACING = 100   // vertical distance between levels

const POS_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  'FA': { fill: '#1e293b', stroke: '#94a3b8', text: '#cbd5e1' },
  'BR': { fill: '#431407', stroke: '#f97316', text: '#fdba74' },
  'ST': { fill: '#422006', stroke: '#eab308', text: '#fde047' },
  'SV': { fill: '#3b0764', stroke: '#a855f7', text: '#d8b4fe' },
}

const SHORT_RANK: Record<string, string> = {
  'FA': 'FA',
  'BR': 'Bronze',
  'ST': 'Star',
  'SV': 'Silver',
}

function posColor(pos: string) {
  return POS_COLORS[pos] ?? POS_COLORS['Member']
}

function shortRank(pos: string): string {
  return SHORT_RANK[pos] ?? pos
}

function shortName(name: string, max = 14): string {
  if (!name) return '-'
  const parts = name.trim().split(/\s+/)
  const full = parts[0]
  if (full.length <= max) return full
  return full.slice(0, max) + '…'
}

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return n.toLocaleString()
}

// ── Full-tree builder (active + inactive) ────────────────────────────────────

function buildFull(
  ids: string[],
  nodeMap: Map<string, TreeNode>,
  childMap: Map<string, TreeNode[]>,
  depth: number,
  maxDepth = 18,
): VizNode[] {
  if (depth > maxDepth) return []
  const result: VizNode[] = []
  for (const id of ids) {
    const n = nodeMap.get(id)
    if (!n) continue
    const childIds = (childMap.get(id) ?? []).map((c) => c.id)
    const children = buildFull(childIds, nodeMap, childMap, depth + 1, maxDepth)
    const subtreeCount = countNodes(children)
    result.push({
      id: n.id,
      name: n.name,
      monthly_bv: n.monthly_bv,
      highest_position: n.highest_position,
      is_active: n.is_active,
      total_vol_left: n.total_vol_left,
      total_vol_right: n.total_vol_right,
      subtreeCount,
      children,
      x: 0,
      y: depth,
      subtreeWidth: 0,
    })
  }
  return result
}

function countNodes(nodes: VizNode[]): number {
  let c = 0
  for (const n of nodes) c += 1 + n.subtreeCount
  return c
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

// ── Flatten helpers ───────────────────────────────────────────────────────────

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

function flatEdges(nodes: VizNode[]): { x1: number; y1: number; x2: number; y2: number }[] {
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = []
  function walk(parent: VizNode) {
    for (const child of parent.children) {
      edges.push({
        x1: parent.x,
        y1: parent.y + CARD_H / 2,
        x2: child.x,
        y2: child.y - CARD_H / 2,
      })
      walk(child)
    }
  }
  nodes.forEach(walk)
  return edges
}

// ── Card Node ─────────────────────────────────────────────────────────────────

function CardNode({ n, isHov }: { n: VizNode; isHov: boolean }) {
  const active = n.is_active === 1
  const c = active ? posColor(n.highest_position) : { fill: '#0f172a', stroke: '#334155', text: '#475569' }
  const rank = shortRank(n.highest_position)
  const cx = n.x - CARD_W / 2
  const cy = n.y - CARD_H / 2

  const badgeW = Math.max(36, rank.length * 5.5 + 8)
  const dimText = active ? '#94a3b8' : '#334155'
  const nameColor = active ? 'white' : '#475569'
  const bvColor = active ? '#4ade80' : '#334155'
  const statusColor = active ? '#4ade80' : '#ef4444'
  const volLColor = active ? '#38bdf8' : '#334155'
  const volRColor = active ? '#c084fc' : '#334155'

  return (
    <g style={{ cursor: 'pointer' }} opacity={active ? 1 : 0.65}>
      {/* Glow on hover */}
      {isHov && (
        <rect
          x={cx - 3}
          y={cy - 3}
          width={CARD_W + 6}
          height={CARD_H + 6}
          rx={11}
          fill={c.stroke}
          opacity={0.18}
        />
      )}

      {/* Card background */}
      <rect
        x={cx}
        y={cy}
        width={CARD_W}
        height={CARD_H}
        rx={8}
        fill={c.fill}
        stroke={c.stroke}
        strokeWidth={isHov ? 2 : 1.2}
        strokeDasharray={active ? undefined : '3 2'}
      />

      {/* ID */}
      <text x={cx + 6} y={cy + 13} fill={dimText} fontSize={8} style={{ userSelect: 'none' }}>
        {n.id}
      </text>

      {/* Rank badge */}
      <rect
        x={cx + CARD_W - badgeW - 4}
        y={cy + 3}
        width={badgeW}
        height={13}
        rx={4}
        fill={c.stroke + '30'}
        stroke={c.stroke}
        strokeWidth={0.8}
      />
      <text
        x={cx + CARD_W - badgeW / 2 - 4}
        y={cy + 12.5}
        textAnchor="middle"
        fill={c.text}
        fontSize={7}
        fontWeight="600"
        style={{ userSelect: 'none' }}
      >
        {rank}
      </text>

      {/* Name */}
      <text
        x={cx + 6}
        y={cy + 27}
        fill={nameColor}
        fontSize={8.5}
        fontWeight="700"
        style={{ userSelect: 'none' }}
      >
        {shortName(n.name)}
      </text>

      {/* BV + Active/Inactive */}
      <text x={cx + 6} y={cy + 40} fill={bvColor} fontSize={7.5} style={{ userSelect: 'none' }}>
        {`BV: ${n.monthly_bv.toLocaleString()}`}
      </text>
      <text
        x={cx + CARD_W - 6}
        y={cy + 40}
        textAnchor="end"
        fill={statusColor}
        fontSize={7}
        style={{ userSelect: 'none' }}
      >
        {active ? 'Active' : 'Inactive'}
      </text>

      {/* L / R vol */}
      <text x={cx + 6} y={cy + 52} fill={volLColor} fontSize={7} style={{ userSelect: 'none' }}>
        {`L: ${fmt(n.total_vol_left)}`}
      </text>
      <text
        x={cx + CARD_W / 2 + 2}
        y={cy + 52}
        fill={volRColor}
        fontSize={7}
        style={{ userSelect: 'none' }}
      >
        {`R: ${fmt(n.total_vol_right)}`}
      </text>

      {/* Subtree count */}
      <text x={cx + 6} y={cy + 64} fill="#64748b" fontSize={7} style={{ userSelect: 'none' }}>
        {`${n.subtreeCount} คน`}
      </text>
    </g>
  )
}

// ── Leg SVG component ─────────────────────────────────────────────────────────

function LegSvg({
  roots,
  label,
  color,
}: {
  roots: VizNode[]
  label: string
  color: string
}) {
  const [hovered, setHovered] = useState<string | null>(null)

  if (roots.length === 0) {
    return (
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold mb-2" style={{ color }}>{label}</p>
        <div className="bg-slate-800/50 rounded-xl p-6 text-center text-slate-500 text-sm">
          ไม่มีสมาชิก
        </div>
      </div>
    )
  }

  const allNodes = flatNodes(roots)
  const edges = flatEdges(roots)

  const totalUnits = roots.reduce((s, n) => s + n.subtreeWidth, 0)
  const svgW = Math.max(CARD_W + 16, totalUnits * H_SPACING + CARD_W)
  const maxY = Math.max(...allNodes.map((n) => n.y))
  const svgH = maxY + CARD_H / 2 + 32

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold" style={{ color }}>{label}</p>
        <p className="text-xs text-slate-500">
          {allNodes.filter(n => n.is_active === 1).length} active / {allNodes.length} คน
        </p>
      </div>
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-x-auto">
        <svg
          width={svgW}
          height={svgH}
          className="block"
          style={{ minWidth: '100%' }}
        >
          {/* Edges */}
          {edges.map((e, i) => (
            <path
              key={`e-${i}`}
              d={`M ${e.x1} ${e.y1} C ${e.x1} ${(e.y1 + e.y2) / 2}, ${e.x2} ${(e.y1 + e.y2) / 2}, ${e.x2} ${e.y2}`}
              stroke="#334155"
              strokeWidth={1.5}
              fill="none"
            />
          ))}

          {/* Nodes */}
          {allNodes.map((n) => (
            <g
              key={n.id}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <CardNode n={n} isHov={hovered === n.id} />
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  const items = Object.entries(POS_COLORS).map(([pos, c]) => ({ pos, label: SHORT_RANK[pos] ?? pos, ...c }))
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ pos, label, stroke, text }) => (
        <div key={pos} className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded border inline-block"
            style={{ background: stroke + '33', borderColor: stroke }}
          />
          <span className="text-xs" style={{ color: text }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main exported section ─────────────────────────────────────────────────────

export function TreeVizSection({
  treeNodes,
  myId,
}: {
  treeNodes: TreeNode[]
  myId: string
}) {
  const { leftRoots, rightRoots } = useMemo(() => {
    if (!myId || !treeNodes.length) return { leftRoots: [], rightRoots: [] }

    const nodeMap = new Map<string, TreeNode>()
    const childMap = new Map<string, TreeNode[]>()
    treeNodes.forEach((n) => {
      nodeMap.set(n.id, n)
      if (n.upline_id) {
        const arr = childMap.get(n.upline_id) ?? []
        arr.push(n)
        childMap.set(n.upline_id, arr)
      }
    })

    const rootKids = childMap.get(myId) ?? []
    const leftStartId = rootKids[0]?.id ?? null
    const rightStartId = rootKids[1]?.id ?? null

    function buildLeg(startId: string | null): VizNode[] {
      if (!startId) return []
      const roots = buildFull([startId], nodeMap, childMap, 0)
      if (roots.length === 0) return []
      layoutForest(roots)
      return roots
    }

    return {
      leftRoots: buildLeg(leftStartId),
      rightRoots: buildLeg(rightStartId),
    }
  }, [treeNodes, myId])

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-slate-800/60 border-b border-slate-700">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <span>🌿</span> สายงาน 2 ขา (ทุกคน)
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          สมาชิก Active แสดงสีปกติ — Inactive แสดงสีเทา เส้นประ
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Legend */}
        <Legend />

        {/* Two legs side by side */}
        <div className="flex gap-4">
          <LegSvg roots={leftRoots} label="← ขาซ้าย" color="#38bdf8" />
          <LegSvg roots={rightRoots} label="ขาขวา →" color="#c084fc" />
        </div>
      </div>
    </div>
  )
}
