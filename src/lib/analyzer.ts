/**
 * analyzeDownline: Build left/right binary-tree subtrees for a given root member.
 *
 * Bug fixes applied:
 * - Bug 3: Walk UP the upline chain using allMembersRaw when a member is not
 *   yet in the built tree. Never use sponsor_id as fallback — upline chain only.
 *   Attach to the first ancestor found in the tree, regardless of isActive.
 * - Bug 2: Output is BFS-ordered (closest to root first = depth ascending).
 * - Bug 4: Left/Right assignment now deterministic — children of each node are
 *   sorted ascending by numeric member ID before being stored in childMap.
 *   Lower member ID = registered earlier in system = LEFT leg.
 *   Higher member ID = registered later = RIGHT leg.
 *   Only upline_id chain is used — sponsor_id is never consulted.
 */

export interface AnalyzeNode {
  id: string
  name: string
  level: number          // level from monthly report
  depth: number          // depth relative to focus root (0 = direct child of root)
  highest_position: string
  is_active: boolean
  monthly_bv: number
  total_vol_left: number
  total_vol_right: number
}

interface RawMember {
  id: string
  upline_id: string | null
  // sponsor_id intentionally NOT used — upline chain only
}

interface ReportNode {
  id: string
  name: string
  level: number
  highest_position: string
  is_active: number  // 1 | 0
  monthly_bv: number
  total_vol_left: number
  total_vol_right: number
}

export function analyzeDownline(
  rootId: string,
  allNodes: ReportNode[],
  allMembersRaw: Record<string, RawMember>
): { left: AnalyzeNode[]; right: AnalyzeNode[] } {
  // ── Step 1: Collect subtree IDs via BFS on allMembersRaw children map ────────
  const childrenByParent: Record<string, string[]> = {}
  for (const [id, m] of Object.entries(allMembersRaw)) {
    if (m.upline_id) {
      if (!childrenByParent[m.upline_id]) childrenByParent[m.upline_id] = []
      childrenByParent[m.upline_id].push(id)
    }
  }
  const subtreeIds = new Set<string>()
  const bfsQueue = [rootId]
  while (bfsQueue.length) {
    const id = bfsQueue.shift()!
    subtreeIds.add(id)
    for (const child of childrenByParent[id] ?? []) bfsQueue.push(child)
  }

  // ── Step 2: Filter report nodes to subtree, build node map ──────────────────
  const subtreeNodes = allNodes.filter((n) => subtreeIds.has(n.id))
  const nodeMap = new Map<string, ReportNode>(subtreeNodes.map((n) => [n.id, n]))

  // ── Step 3: Build binary childMap via correct upline traversal ───────────────
  // Process level-ascending so that closer-to-root nodes are placed first.
  const childMap = new Map<string, string[]>()
  childMap.set(rootId, [])  // root always in map

  const sorted = subtreeNodes
    .filter((n) => n.id !== rootId)
    .sort((a, b) => a.level - b.level)

  for (const n of sorted) {
    let curr: string | null = allMembersRaw[n.id]?.upline_id ?? null
    let parentId: string | null = null

    // Walk UP the upline chain:
    // - If curr is rootId or already placed in childMap → that's the parent
    // - If curr is NOT in childMap/nodeMap, look it up in allMembersRaw and
    //   keep traversing — NEVER fall back to sponsor_id
    while (curr) {
      if (curr === rootId || childMap.has(curr)) {
        parentId = curr
        break
      }
      // curr not placed yet — get its upline from raw data and keep going
      curr = allMembersRaw[curr]?.upline_id ?? null
    }

    if (parentId) {
      const arr = childMap.get(parentId) ?? []
      arr.push(n.id)
      // Sort ascending by numeric member ID so Left = lower ID (registered first),
      // Right = higher ID (registered later). This makes L/R assignment deterministic
      // and based purely on the upline chain — sponsor_id is never consulted.
      arr.sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      childMap.set(parentId, arr)
    }
  }

  // ── Step 4: Identify left / right root ──────────────────────────────────────
  // directKids is already sorted ascending by numeric member ID (from Step 3).
  // Lower member ID (registered first) = LEFT leg.
  // Higher member ID (registered later) = RIGHT leg.
  const directKids = childMap.get(rootId) ?? []
  const leftRootId  = directKids[0] ?? null
  const rightRootId = directKids[1] ?? null

  // ── Step 5: BFS each subtree — BFS order = closest to focus root first ───────
  // Bug 2 fix: depth ascending (BFS) naturally sorts closest-to-root first.
  function collectSubtree(startId: string | null): AnalyzeNode[] {
    if (!startId) return []
    const result: AnalyzeNode[] = []
    const queue: [string, number][] = [[startId, 0]]
    while (queue.length) {
      const [id, depth] = queue.shift()!
      const node = nodeMap.get(id)
      if (node) {
        result.push({
          id:                node.id,
          name:              node.name,
          level:             node.level,
          depth,
          highest_position:  node.highest_position,
          is_active:         node.is_active === 1,
          monthly_bv:        node.monthly_bv,
          total_vol_left:    node.total_vol_left,
          total_vol_right:   node.total_vol_right,
        })
        for (const childId of childMap.get(id) ?? []) {
          queue.push([childId, depth + 1])
        }
      }
    }
    return result  // already BFS-ordered → closest to root first
  }

  return {
    left:  collectSubtree(leftRootId),
    right: collectSubtree(rightRootId),
  }
}
