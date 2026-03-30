import fs from 'fs'
import path from 'path'
import type { Member, MonthlyReport, MonthlySummary, Position } from './types'

const DATA_DIR = path.join(process.cwd(), 'data')
const MEMBERS_FILE = path.join(DATA_DIR, 'members.json')
const MONTHS_FILE = path.join(DATA_DIR, 'months.json')

function reportFile(month: string) {
  return path.join(DATA_DIR, 'reports', `${month}.json`)
}

// ── Loaders ───────────────────────────────────────────────────────────────────

function loadMembers(): Record<string, Member> {
  if (!fs.existsSync(MEMBERS_FILE)) return {}
  return JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf-8'))
}

function loadReport(month: string): MonthlyReport[] {
  const f = reportFile(month)
  if (!fs.existsSync(f)) return []
  return JSON.parse(fs.readFileSync(f, 'utf-8'))
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getAvailableMonths(): string[] {
  if (!fs.existsSync(MONTHS_FILE)) return []
  const months: string[] = JSON.parse(fs.readFileSync(MONTHS_FILE, 'utf-8'))
  return months.sort().reverse()
}

export function getMembersForMonth(month: string): (Member & { report: MonthlyReport })[] {
  const members = loadMembers()
  const reports = loadReport(month)
  return reports
    .map((r) => {
      const m = members[r.member_id]
      if (!m) return null
      return { ...m, report: r }
    })
    .filter(Boolean) as (Member & { report: MonthlyReport })[]
}

export function getMonthlySummaries(): MonthlySummary[] {
  const months = getAvailableMonths().slice().sort()

  // First-seen map for new-member counting
  const firstSeen: Record<string, string> = {}
  for (const month of months) {
    const reports = loadReport(month)
    for (const r of reports) {
      if (!firstSeen[r.member_id]) firstSeen[r.member_id] = month
    }
  }

  return months.map((month) => {
    const reports = loadReport(month)
    const position_counts: Record<string, number> = { FA: 0, BR: 0, ST: 0, SV: 0 }
    let active = 0, qualified = 0, bv = 0, newMembers = 0

    for (const r of reports) {
      if (r.highest_position in position_counts) position_counts[r.highest_position]++
      if (r.is_active) active++
      if (r.is_qualified) qualified++
      bv += r.monthly_bv ?? 0
      if (firstSeen[r.member_id] === month) newMembers++
    }

    return {
      month,
      total_members: reports.length,
      active_members: active,
      qualified_members: qualified,
      new_members: newMembers,
      position_counts: position_counts as Record<Position, number>,
      total_bv: bv,
    }
  })
}

export function getMember(id: string): Member | null {
  const members = loadMembers()
  return members[id] ?? null
}

export function getMemberHistory(id: string): MonthlyReport[] {
  const months = getAvailableMonths().slice().sort()
  const history: MonthlyReport[] = []
  for (const month of months) {
    const reports = loadReport(month)
    const r = reports.find((x) => x.member_id === id)
    if (r) history.push(r)
  }
  return history
}

export function getTreeData(month: string, rootMemberId?: string) {
  const members = loadMembers()
  const reports = loadReport(month)

  // If rootMemberId specified, filter to only that member's subtree
  let visibleIds: Set<string> | null = null
  if (rootMemberId) {
    visibleIds = getSubtreeIds(rootMemberId, members)
  }

  return reports
    .filter((r) => !visibleIds || visibleIds.has(r.member_id))
    .map((r) => {
      const m = members[r.member_id]
      // Re-root the tree: the subtree root's upline becomes null
      const uplineId =
        rootMemberId && m?.upline_id && !visibleIds?.has(m.upline_id)
          ? null
          : m?.upline_id ?? null
      return {
        id: r.member_id,
        name: m?.name ?? '',
        upline_id: uplineId,
        level: r.level,
        highest_position: r.highest_position,
        is_active: r.is_active ? 1 : 0,
        is_qualified: r.is_qualified ? 1 : 0,
        monthly_bv: r.monthly_bv,
        total_vol_left: r.total_vol_left,
        total_vol_right: r.total_vol_right,
      }
    })
}

// ── Subtree helpers ───────────────────────────────────────────────────────────

/** Returns all member IDs in the subtree rooted at rootId (inclusive). */
export function getSubtreeIds(rootId: string, members?: Record<string, Member>): Set<string> {
  const allMembers = members ?? loadMembers()
  // Build children map
  const children: Record<string, string[]> = {}
  for (const m of Object.values(allMembers)) {
    if (m.upline_id) {
      if (!children[m.upline_id]) children[m.upline_id] = []
      children[m.upline_id].push(m.id)
    }
  }
  // BFS
  const result = new Set<string>()
  const queue = [rootId]
  while (queue.length) {
    const id = queue.shift()!
    result.add(id)
    for (const child of children[id] ?? []) queue.push(child)
  }
  return result
}

export function getMembersForMonthSubtree(
  month: string,
  rootMemberId: string
): (Member & { report: MonthlyReport })[] {
  const members = loadMembers()
  const reports = loadReport(month)
  const visibleIds = getSubtreeIds(rootMemberId, members)
  return reports
    .filter((r) => visibleIds.has(r.member_id))
    .map((r) => {
      const m = members[r.member_id]
      if (!m) return null
      return { ...m, report: r }
    })
    .filter(Boolean) as (Member & { report: MonthlyReport })[]
}

/** THB value of a BV amount: 1 BV = 25000/500 = 50 THB */
export function bvToThb(bv: number): number {
  return bv * 25000 / 500
}
