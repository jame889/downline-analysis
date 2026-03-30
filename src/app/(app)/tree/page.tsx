'use client'
import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import PositionBadge from '@/components/PositionBadge'
import Link from 'next/link'

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
  children?: TreeNode[]
}

function buildTree(nodes: TreeNode[]): TreeNode | null {
  const map = new Map<string, TreeNode>()
  nodes.forEach((n) => map.set(n.id, { ...n, children: [] }))
  let root: TreeNode | null = null
  map.forEach((n) => {
    if (!n.upline_id || !map.has(n.upline_id)) {
      if (!root) root = n
    } else {
      const parent = map.get(n.upline_id)!
      parent.children = parent.children ?? []
      parent.children.push(n)
    }
  })
  return root
}

function collectMatchIds(node: TreeNode, q: string): Set<string> {
  const result = new Set<string>()
  if (!q) return result
  const lower = q.toLowerCase()
  function walk(n: TreeNode) {
    if (n.id.includes(q) || n.name.toLowerCase().includes(lower)) {
      result.add(n.id)
    }
    n.children?.forEach(walk)
  }
  walk(node)
  return result
}

// Returns true if this node or any descendant is highlighted
function hasHighlightedDescendant(node: TreeNode, ids: Set<string>): boolean {
  if (ids.has(node.id)) return true
  return (node.children ?? []).some((c) => hasHighlightedDescendant(c, ids))
}

// ── Node card ─────────────────────────────────────────────────────────────────

function NodeCard({
  node,
  depth = 0,
  searchQuery,
  highlightedIds,
  firstMatchRef,
}: {
  node: TreeNode
  depth?: number
  searchQuery?: string
  highlightedIds?: Set<string>
  firstMatchRef?: React.MutableRefObject<HTMLDivElement | null>
}) {
  const isHighlighted = !!(highlightedIds?.has(node.id))
  const hasDescendantMatch = !!(highlightedIds?.size && highlightedIds.size > 0 && hasHighlightedDescendant(node, highlightedIds!))

  // Auto-expand when a descendant matches
  const [expanded, setExpanded] = useState(depth < 2)
  useEffect(() => {
    if (hasDescendantMatch) setExpanded(true)
  }, [hasDescendantMatch])

  const hasChildren = (node.children?.length ?? 0) > 0
  const childCount = node.children?.length ?? 0

  const cardRef = useRef<HTMLDivElement | null>(null)

  // Register first match ref
  useEffect(() => {
    if (isHighlighted && firstMatchRef && !firstMatchRef.current) {
      firstMatchRef.current = cardRef.current
    }
  }, [isHighlighted, firstMatchRef])

  return (
    <div className="flex flex-col items-center shrink-0">
      {/* Card */}
      <div
        ref={cardRef}
        className={`relative bg-slate-900 border rounded-xl p-3 w-48 select-none
          ${hasChildren ? 'cursor-pointer' : ''}
          ${isHighlighted
            ? 'border-yellow-400 shadow-lg shadow-yellow-500/30'
            : node.is_active
              ? 'border-slate-700 hover:border-brand-500'
              : 'border-slate-800 opacity-50'}
          transition-all`}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {isHighlighted && (
          <div className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
        )}
        <div className="flex items-center justify-between mb-1 gap-1">
          <Link
            href={`/members/${node.id}`}
            className="text-brand-400 font-mono text-xs hover:underline shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {node.id}
          </Link>
          <PositionBadge pos={node.highest_position} />
        </div>
        <p className={`text-xs truncate ${isHighlighted ? 'text-yellow-200 font-semibold' : 'text-slate-300'}`}>
          {node.name}
        </p>
        <div className="flex items-center justify-between mt-1.5 text-xs">
          <span className="text-slate-400">
            BV: <span className="text-white">{node.monthly_bv}</span>
          </span>
          <span className={node.is_active ? 'text-green-400' : 'text-slate-600'}>
            {node.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1 text-xs">
          <span className="text-sky-400">L: {node.total_vol_left.toLocaleString()}</span>
          <span className="text-purple-400">R: {node.total_vol_right.toLocaleString()}</span>
        </div>
        {hasChildren && (
          <div className="flex items-center justify-between mt-1 text-xs text-slate-600">
            <span>{childCount} คน</span>
            <span>{expanded ? '▲' : '▼'}</span>
          </div>
        )}
      </div>

      {/* Connector down + children row */}
      {hasChildren && expanded && (
        <div className="flex flex-col items-center">
          {/* Vertical line from card to horizontal bar */}
          <div className="w-px h-5 bg-slate-700" />

          {childCount === 1 ? (
            // Single child — straight line
            <div className="flex flex-col items-center">
              <div className="w-px h-4 bg-slate-700" />
              <NodeCard
                node={node.children![0]}
                depth={depth + 1}
                searchQuery={searchQuery}
                highlightedIds={highlightedIds}
                firstMatchRef={firstMatchRef}
              />
            </div>
          ) : (
            // Multiple children
            <div className="flex flex-col items-center w-full">
              {/* Horizontal bar across all children */}
              <div className="relative flex">
                {node.children!.map((child) => (
                  <div key={child.id} className="flex flex-col items-center px-3">
                    {/* Top connector to horizontal bar */}
                    <div className="w-px h-4 bg-slate-700" />
                    <NodeCard
                      node={child}
                      depth={depth + 1}
                      searchQuery={searchQuery}
                      highlightedIds={highlightedIds}
                      firstMatchRef={firstMatchRef}
                    />
                  </div>
                ))}
                {/* Horizontal bar overlay */}
                <div
                  className="absolute top-0 bg-slate-700"
                  style={{
                    height: '1px',
                    left: `calc(50% / ${childCount})`,
                    right: `calc(50% / ${childCount})`,
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

// ── Main page ─────────────────────────────────────────────────────────────────

function TreeContent() {
  const searchParams = useSearchParams()
  const memberParam = searchParams.get('member')
  const scrollRef = useRef<HTMLDivElement>(null)
  const firstMatchRef = useRef<HTMLDivElement | null>(null)

  const [months, setMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [root, setRoot] = useState<TreeNode | null>(null)
  const [allNodes, setAllNodes] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [totalNodes, setTotalNodes] = useState(0)
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
        const nodes = d.nodes ?? []
        setAllNodes(nodes)
        setTotalNodes(nodes.length)
        const tree = buildTree(nodes)
        setRoot(tree)
        setLoading(false)
        // Scroll to horizontal center after render
        setTimeout(() => {
          if (scrollRef.current) {
            const el = scrollRef.current
            el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
          }
        }, 100)
      })
  }, [selectedMonth, memberParam])

  // Re-build tree when activeOnly changes
  useEffect(() => {
    if (!allNodes.length) return
    const nodes = activeOnly ? allNodes.filter((n) => n.is_active) : allNodes
    const tree = buildTree(nodes)
    setRoot(tree)
    setTimeout(() => {
      if (scrollRef.current) {
        const el = scrollRef.current
        el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
      }
    }, 100)
  }, [activeOnly, allNodes])

  // Scroll to first match when search changes
  const highlightedIds = root && searchQuery.trim()
    ? collectMatchIds(root, searchQuery.trim())
    : new Set<string>()

  const matchCount = highlightedIds.size

  const scrollToFirstMatch = useCallback(() => {
    if (!firstMatchRef.current || !scrollRef.current) return
    const container = scrollRef.current
    const target = firstMatchRef.current
    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const offsetLeft = targetRect.left - containerRect.left + container.scrollLeft
    const offsetTop = targetRect.top - containerRect.top + container.scrollTop
    container.scrollTo({
      left: offsetLeft - containerRect.width / 2 + targetRect.width / 2,
      top: offsetTop - containerRect.height / 2 + targetRect.height / 2,
      behavior: 'smooth',
    })
  }, [])

  useEffect(() => {
    if (!searchQuery.trim()) return
    // Reset ref so first match can re-register
    firstMatchRef.current = null
    // After render, scroll
    setTimeout(() => {
      scrollToFirstMatch()
    }, 150)
  }, [searchQuery, scrollToFirstMatch])

  const gen1Count = root?.children?.length ?? 0
  const activeCount = allNodes.filter((n) => n.is_active).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">โครงสร้าง Downline</h1>
          {!loading && (
            <p className="text-slate-400 text-xs mt-1">
              {totalNodes} คน · Gen 1: {gen1Count} คน · คลิก card เพื่อขยาย/ยุบ
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search box */}
          <div className="flex items-center gap-2">
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
                >
                  ✕
                </button>
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
          </div>

          <button
            onClick={() => setActiveOnly(!activeOnly)}
            className={`text-sm px-3 py-2 rounded-lg border transition-colors font-medium
              ${activeOnly
                ? 'bg-green-900/40 border-green-700 text-green-400'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}
          >
            {activeOnly ? '● Active เท่านั้น' : '○ Active เท่านั้น'}
            {!loading && (
              <span className="ml-1.5 text-xs opacity-60">({activeCount})</span>
            )}
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

      {/* Gen 1 quick count */}
      {!loading && root && gen1Count > 0 && (
        <div className="flex flex-wrap gap-2">
          {root.children!.map((child) => (
            <span
              key={child.id}
              className={`text-xs px-2 py-1 rounded-full border
                ${highlightedIds.has(child.id)
                  ? 'border-yellow-500 text-yellow-400 bg-yellow-900/20'
                  : child.is_active
                    ? 'border-green-800/50 text-green-400 bg-green-900/20'
                    : 'border-slate-700 text-slate-500 bg-slate-900'}`}
            >
              {child.id} {child.name.split(' ')[0]}
              {(child.children?.length ?? 0) > 0 && (
                <span className="text-slate-500 ml-1">({child.children!.length})</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Scroll hint */}
      <p className="text-xs text-slate-600">← เลื่อนซ้าย/ขวาเพื่อดูทั้งหมด →</p>

      {/* Tree container — scrollable both axes */}
      <div
        ref={scrollRef}
        className="overflow-auto border border-slate-800 rounded-xl bg-slate-950 pb-10 pt-6"
        style={{ maxHeight: 'calc(100vh - 260px)' }}
      >
        {loading ? (
          <p className="text-slate-400 py-12 text-center">กำลังโหลด...</p>
        ) : root ? (
          <div className="min-w-max mx-auto px-8">
            <NodeCard
              node={root}
              depth={0}
              searchQuery={searchQuery}
              highlightedIds={highlightedIds}
              firstMatchRef={firstMatchRef}
            />
          </div>
        ) : (
          <p className="text-slate-400 py-12 text-center">ไม่พบข้อมูล</p>
        )}
      </div>
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
