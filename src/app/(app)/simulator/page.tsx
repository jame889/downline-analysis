'use client'
import { useEffect, useState, useMemo } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TreeNode {
  id: string
  name: string
  upline_id: string | null
  level: number
  is_active: number
  monthly_bv: number
  total_vol_left: number
  total_vol_right: number
}

interface MyReport {
  highest_position: string
  monthly_bv: number
  total_vol_left: number
  total_vol_right: number
  is_active: number
}

interface Member {
  id: string
  name: string
}

const PACKS = [
  { label: 'Pack 10,000 (200 BV)', bv: 200, price: 10000 },
  { label: 'Pack 25,000 (500 BV)', bv: 500, price: 25000 },
]

const POSITIONS = [
  { key: 'Manager', minWeakLeg: 1000, teamCommissionRate: 0.1, matrixBonus: 0 },
  { key: 'Senior Manager', minWeakLeg: 3000, teamCommissionRate: 0.1, matrixBonus: 0 },
  { key: 'Director', minWeakLeg: 6000, teamCommissionRate: 0.1, matrixBonus: 500 },
  { key: 'Senior Director', minWeakLeg: 12000, teamCommissionRate: 0.1, matrixBonus: 1000 },
  { key: 'Executive Director', minWeakLeg: 25000, teamCommissionRate: 0.1, matrixBonus: 2000 },
] as const

function getPosition(weakLeg: number): string {
  for (let i = POSITIONS.length - 1; i >= 0; i--) {
    if (weakLeg >= POSITIONS[i].minWeakLeg) return POSITIONS[i].key
  }
  return 'Member'
}

function getTeamCommission(weakLeg: number): number {
  // simplified: 10% of weak leg BV × 5 (BV to THB)
  return Math.floor(weakLeg * 5 * 0.1)
}

function getMatrixBonus(position: string): number {
  const p = POSITIONS.find((p) => p.key === position)
  return p?.matrixBonus ?? 0
}

function getNextPosition(position: string): { name: string; target: number } | null {
  const idx = POSITIONS.findIndex((p) => p.key === position)
  if (idx === -1) {
    // 'Member' → first position
    return { name: POSITIONS[0].key, target: POSITIONS[0].minWeakLeg }
  }
  if (idx < POSITIONS.length - 1) {
    return { name: POSITIONS[idx + 1].key, target: POSITIONS[idx + 1].minWeakLeg }
  }
  return null
}

interface Placement {
  id: string
  uplineId: string
  uplineName: string
  packBv: number
  packLabel: string
  side: 'left' | 'right'
}

// ── Sim Tree ──────────────────────────────────────────────────────────────────

interface SimNode {
  id: string
  name: string
  upline_id: string | null
  is_active: number
  monthly_bv: number
  isSimulated?: boolean
  simBv?: number
  simLabel?: string
  children: SimNode[]
}

function buildSimTree(
  treeNodes: TreeNode[],
  rootId: string,
  placements: Placement[]
): SimNode | null {
  const map = new Map<string, SimNode>()
  treeNodes.forEach((n) =>
    map.set(n.id, {
      id: n.id, name: n.name, upline_id: n.upline_id,
      is_active: n.is_active, monthly_bv: n.monthly_bv, children: [],
    })
  )
  map.forEach((n) => {
    if (n.upline_id && map.has(n.upline_id)) {
      map.get(n.upline_id)!.children.push(n)
    }
  })
  placements.forEach((p, i) => {
    const parent = map.get(p.uplineId)
    if (!parent) return
    parent.children.push({
      id: `sim-${i + 1}`,
      name: `ใหม่ #${i + 1}`,
      upline_id: p.uplineId,
      is_active: 1,
      monthly_bv: p.packBv,
      isSimulated: true,
      simBv: p.packBv,
      simLabel: p.packLabel,
      children: [],
    })
  })
  return map.get(rootId) ?? null
}

function SimNodeCard({
  node,
  depth = 0,
  onSelect,
}: {
  node: SimNode
  depth?: number
  onSelect?: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children.length > 0

  function handleClick() {
    if (!node.isSimulated && onSelect) onSelect(node.id)
    if (hasChildren) setExpanded((v) => !v)
  }

  return (
    <div className="flex flex-col items-center shrink-0">
      <div
        onClick={handleClick}
        className={`relative rounded-xl p-2.5 w-40 select-none cursor-pointer transition-all
          ${node.isSimulated
            ? 'border-2 border-dashed border-green-500 bg-green-900/20'
            : node.is_active
              ? 'border border-slate-700 bg-slate-900 hover:border-brand-500'
              : 'border border-slate-800 bg-slate-900 opacity-40'}`}
      >
        {node.isSimulated && (
          <span className="absolute -top-2 -right-2 text-[10px] bg-green-500 text-white rounded-full px-1.5 py-0.5 font-bold leading-none">
            SIM
          </span>
        )}
        <p className={`text-xs font-mono font-bold truncate ${node.isSimulated ? 'text-green-300' : 'text-brand-400'}`}>
          {node.isSimulated ? node.name : node.id}
        </p>
        {!node.isSimulated && (
          <p className="text-xs text-slate-400 truncate">{node.name.split(' ')[0]}</p>
        )}
        <div className="flex items-center justify-between mt-1 text-xs">
          <span className={node.isSimulated ? 'text-green-400 font-bold' : 'text-slate-500'}>
            {node.isSimulated ? `+${node.simBv} BV` : `${node.monthly_bv} BV`}
          </span>
          {!node.isSimulated && (
            <span className={node.is_active ? 'text-green-400' : 'text-slate-600'}>
              {node.is_active ? '●' : '○'}
            </span>
          )}
        </div>
        {hasChildren && !node.isSimulated && (
          <div className="text-[10px] text-slate-600 text-right mt-0.5">
            {node.children.length} · {expanded ? '▲' : '▼'}
          </div>
        )}
      </div>

      {hasChildren && expanded && (
        <div className="flex flex-col items-center">
          <div className="w-px h-4 bg-slate-700" />
          {node.children.length === 1 ? (
            <div className="flex flex-col items-center">
              <div className="w-px h-3 bg-slate-700" />
              <SimNodeCard node={node.children[0]} depth={depth + 1} onSelect={onSelect} />
            </div>
          ) : (
            <div className="relative flex">
              {node.children.map((child) => (
                <div key={child.id} className="flex flex-col items-center px-2">
                  <div className="w-px h-3 bg-slate-700" />
                  <SimNodeCard node={child} depth={depth + 1} onSelect={onSelect} />
                </div>
              ))}
              <div
                className="absolute top-0 bg-slate-700"
                style={{
                  height: '1px',
                  left: `calc(50% / ${node.children.length})`,
                  right: `calc(50% / ${node.children.length})`,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Balance Bar ───────────────────────────────────────────────────────────────

function BalanceBar({ left, right, label }: { left: number; right: number; label: string }) {
  const total = left + right || 1
  const leftPct = Math.round((left / total) * 100)
  const rightPct = 100 - leftPct
  const diff = Math.abs(left - right)
  const diffPct = Math.round((diff / total) * 100)

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-slate-400">
        <span>ซ้าย {leftPct}%</span>
        <span className="text-slate-500">{label}</span>
        <span>ขวา {rightPct}%</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
        <div
          className="bg-sky-500 rounded-l-full transition-all"
          style={{ width: `${leftPct}%` }}
        />
        <div
          className="bg-purple-500 rounded-r-full transition-all"
          style={{ width: `${rightPct}%` }}
        />
      </div>
      <p className="text-xs text-slate-500 text-center">
        ต่าง {diffPct}% ({diff.toLocaleString()} BV)
      </p>
    </div>
  )
}

// ── Delta badge ───────────────────────────────────────────────────────────────

function Delta({ value, unit = '' }: { value: number; unit?: string }) {
  if (value === 0) return <span className="text-slate-500">-</span>
  return (
    <span className={value > 0 ? 'text-green-400' : 'text-red-400'}>
      {value > 0 ? '+' : ''}{value.toLocaleString()}{unit}
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SimulatorPage() {
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([])
  const [myReport, setMyReport] = useState<MyReport | null>(null)
  const [myId, setMyId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Form state
  const [packIdx, setPackIdx] = useState(0)
  const [uplineInput, setUplineInput] = useState('')
  const [side, setSide] = useState<'left' | 'right'>('left')
  const [uplineError, setUplineError] = useState('')

  // Placements list
  const [placements, setPlacements] = useState<Placement[]>([])
  const [nextId, setNextId] = useState(1)

  const simRoot = useMemo(
    () => (myId && treeNodes.length ? buildSimTree(treeNodes, myId, placements) : null),
    [treeNodes, myId, placements]
  )

  useEffect(() => {
    Promise.all([
      fetch('/api/my').then((r) => r.json()),
      fetch('/api/tree-data').then((r) => r.json()),
    ]).then(([myData, treeData]) => {
      setMyReport(myData.myReport ?? null)
      setMyId(myData.member?.id ?? '')
      const nodes: TreeNode[] = myData.treeNodes ?? treeData.nodes ?? []
      setTreeNodes(nodes)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Compute which side of root a given node is on
  function getSideOfRoot(nodeId: string): 'left' | 'right' | null {
    if (!myReport || !myId) return null
    // BFS/DFS from root children to find the branch
    const map = new Map<string, TreeNode>()
    treeNodes.forEach((n) => map.set(n.id, n))

    // Root is the member themselves; find their direct children
    const rootChildren = treeNodes.filter((n) => n.upline_id === myId)
    if (rootChildren.length < 2) {
      // Only 1 leg or no children — we can't determine side simply
      return null
    }

    function isInSubtree(startId: string, targetId: string): boolean {
      const queue = [startId]
      const visited = new Set<string>()
      while (queue.length) {
        const cur = queue.shift()!
        if (cur === targetId) return true
        if (visited.has(cur)) continue
        visited.add(cur)
        treeNodes.filter((n) => n.upline_id === cur).forEach((c) => queue.push(c.id))
      }
      return false
    }

    // Assume first child = left side (index 0), second = right side (index 1)
    if (isInSubtree(rootChildren[0].id, nodeId) || nodeId === rootChildren[0].id) return 'left'
    if (isInSubtree(rootChildren[1].id, nodeId) || nodeId === rootChildren[1].id) return 'right'
    return null
  }

  function handleAddPlacement() {
    setUplineError('')
    const uid = uplineInput.trim()
    if (!uid) {
      setUplineError('กรุณากรอก Upline ID')
      return
    }
    const found = treeNodes.find((n) => n.id === uid)
    if (!found) {
      setUplineError(`ไม่พบสมาชิก ID "${uid}" ในโครงสร้าง`)
      return
    }
    if (placements.length >= 5) {
      setUplineError('เพิ่มได้สูงสุด 5 คน')
      return
    }
    const pack = PACKS[packIdx]
    setPlacements((prev) => [
      ...prev,
      {
        id: `sim-${nextId}`,
        uplineId: uid,
        uplineName: found.name,
        packBv: pack.bv,
        packLabel: pack.label,
        side,
      },
    ])
    setNextId((n) => n + 1)
    setUplineInput('')
  }

  function handleRemove(id: string) {
    setPlacements((prev) => prev.filter((p) => p.id !== id))
  }

  // Calculate cumulative BV deltas
  const bvDelta = placements.reduce(
    (acc, p) => {
      // Determine which side of root this person goes into
      const nodeInTree = treeNodes.find((n) => n.id === p.uplineId)
      const rootSide = nodeInTree ? getSideOfRoot(nodeInTree.id) : null

      // If we can't determine, use the chosen side
      const effectiveSide = rootSide ?? p.side
      if (effectiveSide === 'left') acc.left += p.packBv
      else acc.right += p.packBv
      return acc
    },
    { left: 0, right: 0 }
  )

  const beforeLeft = myReport?.total_vol_left ?? 0
  const beforeRight = myReport?.total_vol_right ?? 0
  const afterLeft = beforeLeft + bvDelta.left
  const afterRight = beforeRight + bvDelta.right

  const beforeWeak = Math.min(beforeLeft, beforeRight)
  const afterWeak = Math.min(afterLeft, afterRight)
  const beforeStrong = Math.max(beforeLeft, beforeRight)
  const afterStrong = Math.max(afterLeft, afterRight)

  const beforeWeakLeg = beforeWeak > 0 ? (beforeLeft <= beforeRight ? 'ซ้าย' : 'ขวา') : '-'
  const afterWeakLeg = afterWeak > 0 ? (afterLeft <= afterRight ? 'ซ้าย' : 'ขวา') : '-'

  const beforeTeam = getTeamCommission(beforeWeak)
  const afterTeam = getTeamCommission(afterWeak)

  const beforePosition = getPosition(beforeWeak)
  const afterPosition = getPosition(afterWeak)

  const beforeMatrix = getMatrixBonus(beforePosition)
  const afterMatrix = getMatrixBonus(afterPosition)

  const nextPos = getNextPosition(afterPosition)
  const progressPct = nextPos ? Math.min(100, Math.round((afterWeak / nextPos.target) * 100)) : 100

  const hasPlacements = placements.length > 0
  const hasResults = hasPlacements && myReport

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">🧮</span>
        <div>
          <h1 className="text-2xl font-bold text-white">Placement Simulator</h1>
          <p className="text-slate-400 text-sm">จำลองการวางคนใหม่และดูผลกระทบต่อ Vol</p>
        </div>
      </div>

      {loading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
          กำลังโหลดข้อมูล...
        </div>
      ) : !myReport ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
          ไม่พบข้อมูลองค์กร
        </div>
      ) : (
        <>
          {/* Current state summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-300">สถานะปัจจุบัน</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-800 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">Vol ซ้าย</p>
                <p className="text-sky-400 font-bold">{beforeLeft.toLocaleString()}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">Vol ขวา</p>
                <p className="text-purple-400 font-bold">{beforeRight.toLocaleString()}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">Weak Leg</p>
                <p className="text-white font-bold">{beforeWeak.toLocaleString()}</p>
              </div>
            </div>
            <BalanceBar left={beforeLeft} right={beforeRight} label="สมดุลปัจจุบัน" />
          </div>

          {/* New Member Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span>➕</span> เพิ่มคนใหม่
            </h2>

            {/* Pack selector */}
            <div className="space-y-1.5">
              <label className="text-sm text-slate-400">แพ็คเกจ</label>
              <div className="grid grid-cols-2 gap-2">
                {PACKS.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPackIdx(i)}
                    className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors text-left ${
                      packIdx === i
                        ? 'border-brand-500 bg-brand-900/30 text-brand-300'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-bold">{p.bv} BV</div>
                    <div className="text-xs opacity-70">฿{p.price.toLocaleString()}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Upline ID */}
            <div className="space-y-1.5">
              <label className="text-sm text-slate-400">Upline ID (สมาชิกในโครงสร้าง)</label>
              <input
                type="text"
                value={uplineInput}
                onChange={(e) => {
                  setUplineInput(e.target.value)
                  setUplineError('')
                }}
                placeholder="เช่น A001"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500 transition-colors"
              />
              {uplineError && <p className="text-xs text-red-400">{uplineError}</p>}
            </div>

            {/* Side */}
            <div className="space-y-1.5">
              <label className="text-sm text-slate-400">วางฝั่ง (fallback เมื่อตรวจไม่ได้)</label>
              <div className="grid grid-cols-2 gap-2">
                {(['left', 'right'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSide(s)}
                    className={`py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                      side === s
                        ? s === 'left'
                          ? 'border-sky-500 bg-sky-900/30 text-sky-300'
                          : 'border-purple-500 bg-purple-900/30 text-purple-300'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {s === 'left' ? '← ซ้าย' : 'ขวา →'}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddPlacement}
              disabled={placements.length >= 5}
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
            >
              {placements.length >= 5 ? 'เพิ่มได้สูงสุด 5 คน' : 'จำลอง ➔'}
            </button>
          </div>

          {/* Placements list */}
          {placements.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h2 className="text-base font-semibold text-white flex items-center justify-between">
                <span>รายการจำลอง ({placements.length}/5)</span>
                <button
                  onClick={() => setPlacements([])}
                  className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                >
                  ล้างทั้งหมด
                </button>
              </h2>
              <div className="space-y-2">
                {placements.map((p) => {
                  const node = treeNodes.find((n) => n.id === p.uplineId)
                  const rootSide = node ? getSideOfRoot(node.id) : null
                  const effectiveSide = rootSide ?? p.side
                  return (
                    <div key={p.id} className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          effectiveSide === 'left'
                            ? 'bg-sky-900/50 text-sky-300 border border-sky-800'
                            : 'bg-purple-900/50 text-purple-300 border border-purple-800'
                        }`}>
                          {effectiveSide === 'left' ? 'ซ้าย' : 'ขวา'}
                        </span>
                        <div>
                          <p className="text-sm text-white font-medium">Upline: {p.uplineId} — {p.uplineName}</p>
                          <p className="text-xs text-slate-500">{p.packLabel}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-green-400 text-sm font-bold">+{p.packBv} BV</span>
                        <button
                          onClick={() => handleRemove(p.id)}
                          className="text-slate-600 hover:text-red-400 text-lg leading-none transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-3 text-sm text-slate-400 border-t border-slate-800 pt-3">
                <span>รวม: <span className="text-sky-400 font-bold">+{bvDelta.left} BV ซ้าย</span></span>
                <span>·</span>
                <span><span className="text-purple-400 font-bold">+{bvDelta.right} BV ขวา</span></span>
              </div>
            </div>
          )}

          {/* Binary Tree View */}
          {simRoot && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <span>🌳</span> ผังโครงสร้าง Binary
                </h2>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {placements.length > 0 && (
                    <span className="flex items-center gap-1 text-green-400 border border-green-800 rounded-full px-2 py-0.5">
                      <span className="w-2 h-2 border border-dashed border-green-400 rounded-sm inline-block" />
                      SIM = คนที่จำลอง
                    </span>
                  )}
                  <span>คลิก card → เลือกเป็น Upline</span>
                </div>
              </div>
              <div
                className="overflow-auto bg-slate-950 rounded-xl pt-5 pb-8 px-4"
                style={{ maxHeight: '420px' }}
              >
                <div className="min-w-max mx-auto">
                  <SimNodeCard
                    node={simRoot}
                    depth={0}
                    onSelect={(id) => {
                      setUplineInput(id)
                      setUplineError('')
                    }}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-600">← เลื่อนซ้าย/ขวาเพื่อดูทั้งหมด · คลิก card ที่มีลูกเพื่อขยาย/ยุบ</p>
            </div>
          )}

          {/* Result Card */}
          {hasResults && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span>📈</span> ผลลัพธ์การจำลอง
              </h2>

              {/* Before/After table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-800">
                      <th className="pb-2 font-medium"></th>
                      <th className="pb-2 font-medium text-right">ก่อน</th>
                      <th className="pb-2 font-medium text-right">หลัง</th>
                      <th className="pb-2 font-medium text-right">+/-</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    <tr>
                      <td className="py-2.5 text-slate-400">Vol ซ้าย</td>
                      <td className="py-2.5 text-right text-sky-400">{beforeLeft.toLocaleString()}</td>
                      <td className="py-2.5 text-right text-sky-300 font-medium">{afterLeft.toLocaleString()}</td>
                      <td className="py-2.5 text-right"><Delta value={bvDelta.left} /></td>
                    </tr>
                    <tr>
                      <td className="py-2.5 text-slate-400">Vol ขวา</td>
                      <td className="py-2.5 text-right text-purple-400">{beforeRight.toLocaleString()}</td>
                      <td className="py-2.5 text-right text-purple-300 font-medium">{afterRight.toLocaleString()}</td>
                      <td className="py-2.5 text-right"><Delta value={bvDelta.right} /></td>
                    </tr>
                    <tr>
                      <td className="py-2.5 text-slate-400">Minor Leg (Weak)</td>
                      <td className="py-2.5 text-right text-white">{beforeWeak.toLocaleString()}</td>
                      <td className="py-2.5 text-right text-white font-medium">{afterWeak.toLocaleString()}</td>
                      <td className="py-2.5 text-right"><Delta value={afterWeak - beforeWeak} /></td>
                    </tr>
                    <tr>
                      <td className="py-2.5 text-slate-400">ค่าทีม/เดือน</td>
                      <td className="py-2.5 text-right text-white">฿{beforeTeam.toLocaleString()}</td>
                      <td className="py-2.5 text-right text-white font-medium">฿{afterTeam.toLocaleString()}</td>
                      <td className="py-2.5 text-right"><Delta value={afterTeam - beforeTeam} unit=" ฿" /></td>
                    </tr>
                    <tr>
                      <td className="py-2.5 text-slate-400">Matrix Bonus</td>
                      <td className="py-2.5 text-right text-white">฿{beforeMatrix.toLocaleString()}</td>
                      <td className="py-2.5 text-right text-white font-medium">฿{afterMatrix.toLocaleString()}</td>
                      <td className="py-2.5 text-right"><Delta value={afterMatrix - beforeMatrix} unit=" ฿" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Weak leg indicator */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">Weak Leg ก่อน</p>
                  <p className="text-white font-bold">{beforeWeakLeg} ({beforeWeak.toLocaleString()} BV)</p>
                </div>
                <div className="bg-slate-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">Weak Leg หลัง</p>
                  <p className={`font-bold ${afterWeakLeg !== beforeWeakLeg ? 'text-yellow-400' : 'text-white'}`}>
                    {afterWeakLeg} ({afterWeak.toLocaleString()} BV)
                    {afterWeakLeg !== beforeWeakLeg && (
                      <span className="ml-1 text-xs text-yellow-500">⚠️ สลับขา!</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Balance summary (compact) */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-800 rounded-lg p-2.5 space-y-1">
                  <p className="text-slate-500">ก่อน</p>
                  <div className="flex justify-between">
                    <span className="text-sky-400">ซ้าย {beforeLeft.toLocaleString()}</span>
                    <span className="text-purple-400">ขวา {beforeRight.toLocaleString()}</span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden gap-px">
                    <div className="bg-sky-500 rounded-l-full" style={{ width: `${Math.round((beforeLeft / (beforeLeft + beforeRight || 1)) * 100)}%` }} />
                    <div className="bg-purple-500 rounded-r-full flex-1" />
                  </div>
                </div>
                <div className="bg-slate-800 rounded-lg p-2.5 space-y-1">
                  <p className="text-slate-500">หลัง (จำลอง)</p>
                  <div className="flex justify-between">
                    <span className="text-sky-400">ซ้าย {afterLeft.toLocaleString()}</span>
                    <span className="text-purple-400">ขวา {afterRight.toLocaleString()}</span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden gap-px">
                    <div className="bg-sky-500 rounded-l-full" style={{ width: `${Math.round((afterLeft / (afterLeft + afterRight || 1)) * 100)}%` }} />
                    <div className="bg-purple-500 rounded-r-full flex-1" />
                  </div>
                </div>
              </div>

              {/* Rank impact */}
              <div className="bg-slate-800 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-white">ผลกระทบต่อ Rank</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">ก่อน</p>
                    <p className="text-yellow-400 font-bold">{beforePosition}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">หลัง</p>
                    <p className={`font-bold ${afterPosition !== beforePosition ? 'text-green-400' : 'text-yellow-400'}`}>
                      {afterPosition}
                      {afterPosition !== beforePosition && ' 🎉 อัพ!'}
                    </p>
                  </div>
                </div>
                {nextPos && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>ใกล้จะถึง: <span className="text-white">{nextPos.name}</span></span>
                      <span>{progressPct}% ({afterWeak.toLocaleString()} / {nextPos.target.toLocaleString()} BV)</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      ต้องการ Weak Leg อีก {Math.max(0, nextPos.target - afterWeak).toLocaleString()} BV
                    </p>
                  </div>
                )}
                {!nextPos && (
                  <p className="text-xs text-green-400">✓ ถึง Rank สูงสุดแล้ว</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
