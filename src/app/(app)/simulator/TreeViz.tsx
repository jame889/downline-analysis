'use client'
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TreeNode {
  id: string
  name: string
  join_date?: string
  country?: string
  upline_id: string | null
  sponsor_id?: string | null
  sponsor_name?: string
  level: number
  highest_position: string
  is_active: number
  is_qualified?: number
  monthly_bv: number
  total_vol_left: number
  total_vol_right: number
}

interface OrgNode extends TreeNode {
  children: OrgNode[]
  sideLabel: 'ซ้าย' | 'ขวา' | null
  _ref?: React.RefObject<HTMLDivElement | null>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const POS_FULL: Record<string, string> = {
  FA: 'First Agent', BR: 'Bronze', ST: 'Star', SV: 'Silver',
  Star: 'Star', Bronze: 'Bronze', Silver: 'Silver', Gold: 'Gold',
  Platinum: 'Platinum', Ruby: 'Ruby', Diamond: 'Diamond',
}
const getPosLabel = (p: string) => POS_FULL[p] ?? p

const HEADER_COLOR: Record<string, string> = {
  FA: '#6b7280',   // gray
  BR: '#f97316',   // orange
  ST: '#d97706',   // amber
  SV: '#9333ea',   // purple
}
const getHeaderColor = (p: string) => HEADER_COLOR[p] ?? '#f97316'

function flagEmoji(country = 'TH') {
  if (country === 'TH') return '🇹🇭'
  if (country === 'LA') return '🇱🇦'
  if (country === 'MM') return '🇲🇲'
  if (country === 'KH') return '🇰🇭'
  if (country === 'VN') return '🇻🇳'
  return '🌐'
}

// ── Tree Builder ──────────────────────────────────────────────────────────────

function buildForest(
  nodes: TreeNode[],
  rootId: string,
  field: 'upline_id' | 'sponsor_id',
): { root: OrgNode | null; leftChild: OrgNode | null; rightChild: OrgNode | null } {
  const nodeMap = new Map<string, TreeNode>()
  const childMap = new Map<string, TreeNode[]>()

  for (const n of nodes) {
    nodeMap.set(n.id, n)
    const pid = field === 'sponsor_id' ? (n.sponsor_id ?? null) : n.upline_id
    if (pid) {
      const arr = childMap.get(pid) ?? []
      arr.push(n)
      childMap.set(pid, arr)
    }
  }

  function build(id: string, depth: number, side: 'ซ้าย' | 'ขวา' | null): OrgNode | null {
    const n = nodeMap.get(id)
    if (!n || depth > 20) return null
    const kids = childMap.get(id) ?? []
    const children = kids
      .map((k, i) => build(k.id, depth + 1, i === 0 ? 'ซ้าย' : 'ขวา'))
      .filter(Boolean) as OrgNode[]
    return { ...n, children, sideLabel: side }
  }

  const root = build(rootId, 0, null)
  if (!root) return { root: null, leftChild: null, rightChild: null }
  return {
    root,
    leftChild: root.children[0] ?? null,
    rightChild: root.children[1] ?? null,
  }
}

function flattenNodes(node: OrgNode): OrgNode[] {
  const result: OrgNode[] = [node]
  for (const c of node.children) result.push(...flattenNodes(c))
  return result
}

// ── Org Card ──────────────────────────────────────────────────────────────────

function OrgCard({
  node, isCollapsed, isHighlighted, onToggle,
  cardRef,
}: {
  node: OrgNode
  isCollapsed: boolean
  isHighlighted: boolean
  onToggle: () => void
  cardRef?: React.Ref<HTMLDivElement>
}) {
  const active = !!node.is_active
  const qualified = !!(node.is_qualified)
  const hasLeftVol = node.total_vol_left > 0
  const hasRightVol = node.total_vol_right > 0
  const hasChildren = node.children.length > 0
  const headerColor = getHeaderColor(node.highest_position)

  return (
    <div
      ref={cardRef}
      className={`w-52 rounded-lg border shadow-md overflow-hidden bg-white cursor-default select-none
        ${isHighlighted ? 'ring-2 ring-yellow-400 shadow-yellow-200' : 'border-gray-200'}`}
    >
      {/* Colored header */}
      <div
        className="flex items-center justify-between px-2.5 py-1.5"
        style={{ backgroundColor: headerColor }}
      >
        <span className="text-white font-bold text-xs tracking-wide">{node.id}</span>
        <span className="text-base leading-none">{flagEmoji(node.country)}</span>
      </div>

      {/* Card body */}
      <div className="px-2.5 pt-2 pb-1.5 space-y-0.5 text-gray-700">
        {/* Name + side label */}
        <p className="font-semibold text-gray-900 text-[11.5px] leading-snug">
          {node.name}
          {node.sideLabel && (
            <span className="text-gray-400 font-normal">({node.sideLabel})</span>
          )}
        </p>

        {/* Join date */}
        {node.join_date && (
          <p className="text-[10px] text-gray-400">{node.join_date}</p>
        )}

        {/* Position */}
        <p className="text-[10.5px] text-gray-600 font-medium">{getPosLabel(node.highest_position)}</p>

        {/* Sponsor/Upline link */}
        {node.sponsor_id && (
          <p className="text-[10px] truncate">
            <Link
              href={`/members/${node.sponsor_id}`}
              className="text-blue-500 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {node.sponsor_id} 👤{(node.sponsor_name ?? '').split(' ')[0]}
            </Link>
          </p>
        )}

        {/* Status rows */}
        <div className="text-[10px] leading-relaxed pt-0.5">
          <span className="text-gray-400">สถานะแอคทีฟ: </span>
          <span className={hasLeftVol ? 'text-gray-600' : 'text-red-500'}>
            (ส.){hasLeftVol ? 'บรรลุ' : 'ไม่บรรลุ'}
          </span>{' '}
          <span className={hasRightVol ? 'text-gray-600' : 'text-red-500'}>
            (ด.){hasRightVol ? 'บรรลุ' : 'ไม่บรรลุ'}
          </span>
        </div>
        <div className="text-[10px] leading-relaxed">
          <span className="text-gray-400">สถานะคอวอลิฟาย: </span>
          <span className={active ? 'text-gray-600' : 'text-red-500'}>
            (ส.){active ? 'บรรลุ' : 'ไม่บรรลุ'}
          </span>{' '}
          <span className={qualified ? 'text-gray-600' : 'text-red-500'}>
            (ด.){qualified ? 'บรรลุ' : 'ไม่บรรลุ'}
          </span>
        </div>
      </div>

      {/* Collapse / Expand button */}
      {hasChildren && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className="w-full flex justify-center items-center py-0.5 bg-gray-50 border-t border-gray-200 text-gray-400 hover:bg-gray-100 transition-colors text-xs"
        >
          {isCollapsed ? '∨' : '∧'}
        </button>
      )}
    </div>
  )
}

// ── Recursive Tree Node ───────────────────────────────────────────────────────

function OrgTreeNode({
  node, depth, maxDepth, collapsed, onToggle, highlightedIds, flipped, nodeRefs,
}: {
  node: OrgNode
  depth: number
  maxDepth: number
  collapsed: Set<string>
  onToggle: (id: string) => void
  highlightedIds: Set<string>
  flipped: boolean
  nodeRefs: Map<string, { current: HTMLDivElement | null }>
}) {
  const isCollapsed = collapsed.has(node.id)
  const showChildren = !isCollapsed && depth < maxDepth && node.children.length > 0
  const kids = showChildren
    ? (flipped ? [...node.children].reverse() : node.children)
    : []

  if (!nodeRefs.has(node.id)) {
    nodeRefs.set(node.id, { current: null } as { current: HTMLDivElement | null })
  }
  const ref = nodeRefs.get(node.id)!

  return (
    <div className="flex flex-col items-center shrink-0">
      <OrgCard
        node={node}
        isCollapsed={isCollapsed}
        isHighlighted={highlightedIds.has(node.id)}
        onToggle={() => onToggle(node.id)}
        cardRef={(el) => { ref.current = el }}
      />

      {kids.length > 0 && (
        <div className="flex flex-col items-center">
          {/* Vertical stem down from card */}
          <div className="w-px h-4 bg-gray-300" />

          {kids.length === 1 ? (
            <div className="flex flex-col items-center">
              <div className="w-px h-4 bg-gray-300" />
              <OrgTreeNode
                node={kids[0]} depth={depth + 1} maxDepth={maxDepth}
                collapsed={collapsed} onToggle={onToggle}
                highlightedIds={highlightedIds} flipped={flipped}
                nodeRefs={nodeRefs}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center w-full">
              <div className="relative flex items-start">
                {kids.map((child) => (
                  <div key={child.id} className="flex flex-col items-center px-4">
                    <div className="w-px h-4 bg-gray-300" />
                    <OrgTreeNode
                      node={child} depth={depth + 1} maxDepth={maxDepth}
                      collapsed={collapsed} onToggle={onToggle}
                      highlightedIds={highlightedIds} flipped={flipped}
                      nodeRefs={nodeRefs}
                    />
                  </div>
                ))}
                {/* Horizontal bar */}
                <div
                  className="absolute top-0 bg-gray-300 pointer-events-none"
                  style={{
                    height: '1px',
                    left: `calc(50% / ${kids.length})`,
                    right: `calc(50% / ${kids.length})`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Root Card (larger, at top) ────────────────────────────────────────────────

function RootOrgCard({ node }: { node: OrgNode }) {
  const headerColor = getHeaderColor(node.highest_position)
  const active = !!node.is_active

  return (
    <div
      className="w-64 rounded-xl border-2 border-gray-300 shadow-lg overflow-hidden bg-white"
      style={{ borderColor: headerColor }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ backgroundColor: headerColor }}
      >
        <span className="text-white font-bold text-sm tracking-wide">{node.id}</span>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {active ? 'Active' : 'Inactive'}
          </span>
          <span className="text-lg leading-none">{flagEmoji(node.country)}</span>
        </div>
      </div>
      <div className="px-3 py-2.5 space-y-1">
        <p className="font-bold text-gray-900 text-sm">{node.name}</p>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {node.join_date && <span>{node.join_date}</span>}
          <span className="font-medium text-gray-700">{getPosLabel(node.highest_position)}</span>
        </div>
        <div className="flex gap-3 text-xs pt-0.5">
          <span className="text-sky-600">L: {node.total_vol_left.toLocaleString()}</span>
          <span className="text-purple-600">R: {node.total_vol_right.toLocaleString()}</span>
          <span className="text-green-600">BV: {node.monthly_bv}</span>
        </div>
      </div>
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { color: '#6b7280', label: 'First Agent' },
    { color: '#f97316', label: 'Bronze' },
    { color: '#d97706', label: 'Star' },
    { color: '#9333ea', label: 'Silver' },
  ]
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: it.color }} />
          <span className="text-xs text-gray-600">{it.label}</span>
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
  const [activeTab, setActiveTab] = useState<'binary' | 'referral'>('binary')
  const [zoom, setZoom] = useState(70)
  const [maxDepth, setMaxDepth] = useState(3)
  const [flipped, setFlipped] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useMemo(() => new Map<string, { current: HTMLDivElement | null }>(), [])

  // Auto-center horizontally on mount / data change
  const centerScroll = () => {
    setTimeout(() => {
      const el = containerRef.current
      if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
    }, 100)
  }

  const field: 'upline_id' | 'sponsor_id' = activeTab === 'binary' ? 'upline_id' : 'sponsor_id'

  const { root, leftChild, rightChild } = useMemo(() => {
    if (!myId || !treeNodes.length) return { root: null, leftChild: null, rightChild: null }
    const result = buildForest(treeNodes, myId, field)
    centerScroll()
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeNodes, myId, field])

  const highlightedIds = useMemo(() => {
    if (!searchQuery.trim() || !root) return new Set<string>()
    const q = searchQuery.trim().toLowerCase()
    const all = flattenNodes(root)
    const ids = new Set<string>()
    for (const n of all) {
      if (n.id.includes(q) || n.name.toLowerCase().includes(q)) ids.add(n.id)
    }
    return ids
  }, [searchQuery, root])

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const changeZoom = (delta: number) =>
    setZoom((z) => Math.min(200, Math.max(20, z + delta)))

  const navigateTo = (side: 'left' | 'right') => {
    if (!root || !containerRef.current) return
    const all = flattenNodes(root)
    // find leftmost or rightmost by checking which leg
    const kids = flipped
      ? (side === 'left' ? root.children[1] : root.children[0])
      : (side === 'left' ? root.children[0] : root.children[1])
    if (!kids) return
    // Walk to deepest visible node on that side
    let node: OrgNode = kids
    while (node.children.length > 0 && !collapsed.has(node.id)) {
      node = node.children[0]
    }
    const ref = nodeRefs.get(node.id)
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    }
  }

  const totalCount = root ? flattenNodes(root).length : 0
  const activeCount = root ? flattenNodes(root).filter(n => !!n.is_active).length : 0

  if (!myId || !treeNodes.length) return null

  const leftLeg = flipped ? rightChild : leftChild
  const rightLeg = flipped ? leftChild : rightChild

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Section title + tabs */}
      <div className="border-b border-gray-200">
        <div className="px-4 pt-4 pb-0">
          <h2 className="text-base font-bold text-gray-800 mb-3">ดูโครงสร้างการแนะนำและไบนารี่</h2>
          <div className="flex gap-1">
            {[
              { key: 'binary', label: 'ดูโครงสร้างการแนะนำ' },
              { key: 'referral', label: 'ดูโครงสร้างไบนารี่' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as 'binary' | 'referral')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-orange-500 text-orange-600 bg-orange-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        {/* Zoom controls */}
        <div className="flex items-center gap-1.5 bg-white border border-gray-300 rounded-lg px-2 py-1">
          <span className="text-xs text-gray-500 w-8 text-right tabular-nums">{zoom}%</span>
          <button
            onClick={() => changeZoom(-10)}
            disabled={zoom <= 20}
            className="text-gray-500 hover:text-gray-800 disabled:opacity-30 w-4 text-center font-bold"
          >−</button>
          <input
            type="range" min={20} max={200} step={5} value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
            className="w-24 h-1.5 accent-orange-500"
          />
          <button
            onClick={() => changeZoom(10)}
            disabled={zoom >= 200}
            className="text-gray-500 hover:text-gray-800 disabled:opacity-30 w-4 text-center font-bold"
          >+</button>
        </div>

        {/* Depth */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">ขั้นตอน</span>
          <select
            value={maxDepth}
            onChange={(e) => setMaxDepth(+e.target.value)}
            className="text-xs bg-white border border-gray-300 rounded-lg px-2 py-1 text-gray-700"
          >
            {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* Flip */}
        <button
          onClick={() => setFlipped(f => !f)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            flipped
              ? 'bg-orange-100 border-orange-300 text-orange-700'
              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          การแปลงแผนผัง
        </button>

        {/* Navigate */}
        <button
          onClick={() => navigateTo('left')}
          className="text-xs px-3 py-1.5 rounded-lg border bg-white border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          เอเย่นต์ฝั่งซ้ายสุด
        </button>
        <button
          onClick={() => navigateTo('right')}
          className="text-xs px-3 py-1.5 rounded-lg border bg-white border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          เอเย่นต์ฝั่งขวาสุด
        </button>

        {/* Summary */}
        <span className="ml-auto text-xs text-gray-400">
          {activeCount} active / {totalCount} คน
        </span>
      </div>

      {/* Search */}
      <div className="px-4 py-2.5 border-b border-gray-100 bg-white">
        <div className="relative max-w-sm">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="กรอกหมายเลขสมาชิกหรือชื่อสมาชิก"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 pr-8 text-gray-700 placeholder-gray-400 focus:outline-none focus:border-orange-400 bg-white"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-7 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs mr-0.5"
            >✕</button>
          )}
        </div>
        {searchQuery.trim() && (
          <p className="text-xs mt-1 text-gray-500">
            {highlightedIds.size > 0 ? `พบ ${highlightedIds.size} คน` : 'ไม่พบ'}
          </p>
        )}
      </div>

      {/* Legend */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
        <Legend />
      </div>

      {/* Tree area */}
      {!root ? (
        <div className="p-8 text-center text-gray-400">ไม่พบข้อมูล</div>
      ) : (
        <div
          ref={containerRef}
          className="overflow-auto bg-white"
          style={{ maxHeight: '75vh' }}
        >
          <div
            className="p-6 min-w-max"
            style={{ zoom: zoom / 100 }}
          >
            {/* Root node */}
            <div className="flex justify-center mb-0">
              <RootOrgCard node={root} />
            </div>

            {/* Vertical stem */}
            <div className="flex justify-center">
              <div className="w-px h-5 bg-gray-300" />
            </div>

            {/* Two legs */}
            <div className="flex gap-8 items-start justify-center">
              {/* Left leg */}
              <div className="flex flex-col items-center">
                <div className="text-xs font-semibold text-sky-600 mb-2">← ขาซ้าย</div>
                {leftLeg ? (
                  <OrgTreeNode
                    node={leftLeg} depth={0} maxDepth={maxDepth}
                    collapsed={collapsed} onToggle={toggleCollapse}
                    highlightedIds={highlightedIds} flipped={flipped}
                    nodeRefs={nodeRefs}
                  />
                ) : (
                  <div className="w-52 p-4 border border-dashed border-gray-300 rounded-lg text-center text-gray-400 text-xs">
                    ไม่มีสมาชิก
                  </div>
                )}
              </div>

              {/* Right leg */}
              <div className="flex flex-col items-center">
                <div className="text-xs font-semibold text-purple-600 mb-2">ขาขวา →</div>
                {rightLeg ? (
                  <OrgTreeNode
                    node={rightLeg} depth={0} maxDepth={maxDepth}
                    collapsed={collapsed} onToggle={toggleCollapse}
                    highlightedIds={highlightedIds} flipped={flipped}
                    nodeRefs={nodeRefs}
                  />
                ) : (
                  <div className="w-52 p-4 border border-dashed border-gray-300 rounded-lg text-center text-gray-400 text-xs">
                    ไม่มีสมาชิก
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
