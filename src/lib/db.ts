import fs from 'fs'
import path from 'path'
import type { Member, MonthlyReport, MonthlySummary, Position } from './types'
import { sbSelect, sbUpsert } from './supabase'

const DATA_DIR = path.join(process.cwd(), 'data')
const MEMBERS_FILE = path.join(DATA_DIR, 'members.json')
const MONTHS_FILE = path.join(DATA_DIR, 'months.json')

const USE_SUPABASE = !!process.env.SUPABASE_URL

function reportFile(month: string) {
  return path.join(DATA_DIR, 'reports', `${month}.json`)
}

// ── Local JSON loaders (sync, always available from bundled files) ─────────────

function loadMembersLocal(): Record<string, Member> {
  if (!fs.existsSync(MEMBERS_FILE)) return {}
  return JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf-8'))
}

function loadReportLocal(month: string): MonthlyReport[] {
  const f = reportFile(month)
  if (!fs.existsSync(f)) return []
  return JSON.parse(fs.readFileSync(f, 'utf-8'))
}

function getMonthsLocal(): string[] {
  if (!fs.existsSync(MONTHS_FILE)) return []
  return JSON.parse(fs.readFileSync(MONTHS_FILE, 'utf-8'))
}

// ── Supabase loaders (async) ───────────────────────────────────────────────────

async function loadMembersSupabase(): Promise<Record<string, Member>> {
  try {
    const rows = await sbSelect<Member>('members', 'select=*')
    const map: Record<string, Member> = {}
    for (const r of rows) map[r.id] = r
    return map
  } catch { return {} }
}

async function loadReportSupabase(month: string): Promise<MonthlyReport[]> {
  try {
    return await sbSelect<MonthlyReport>(
      'monthly_reports',
      `month=eq.${encodeURIComponent(month)}&select=*`
    )
  } catch { return [] }
}

async function getMonthsSupabase(): Promise<string[]> {
  try {
    const rows = await sbSelect<{ month: string }>('monthly_reports', 'select=month')
    return Array.from(new Set(rows.map((r) => r.month)))
  } catch { return [] }
}

// ── Smart loaders: Supabase preferred, JSON fallback ──────────────────────────

async function loadMembers(): Promise<Record<string, Member>> {
  if (!USE_SUPABASE) return loadMembersLocal()
  const sb = await loadMembersSupabase()
  if (Object.keys(sb).length > 0) return sb
  return loadMembersLocal() // fallback to bundled JSON
}

async function loadReport(month: string): Promise<MonthlyReport[]> {
  if (!USE_SUPABASE) return loadReportLocal(month)
  const sb = await loadReportSupabase(month)
  if (sb.length > 0) return sb
  return loadReportLocal(month) // fallback to bundled JSON
}

// ── Public API (async) ────────────────────────────────────────────────────────

export async function getAvailableMonths(): Promise<string[]> {
  if (!USE_SUPABASE) return getMonthsLocal().sort().reverse()
  const [sbMonths, localMonths] = await Promise.all([
    getMonthsSupabase(),
    Promise.resolve(getMonthsLocal()),
  ])
  const all = new Set([...sbMonths, ...localMonths])
  return Array.from(all).sort().reverse()
}

export async function getMembersForMonth(month: string): Promise<(Member & { report: MonthlyReport })[]> {
  const [members, reports] = await Promise.all([loadMembers(), loadReport(month)])
  return reports
    .map((r) => {
      const m = members[r.member_id]
      if (!m) return null
      return { ...m, report: r }
    })
    .filter(Boolean) as (Member & { report: MonthlyReport })[]
}

export async function getMonthlySummaries(): Promise<MonthlySummary[]> {
  const months = (await getAvailableMonths()).slice().sort()

  const firstSeen: Record<string, string> = {}
  for (const month of months) {
    const reports = await loadReport(month)
    for (const r of reports) {
      if (!firstSeen[r.member_id]) firstSeen[r.member_id] = month
    }
  }

  return Promise.all(
    months.map(async (month) => {
      const reports = await loadReport(month)
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
  )
}

export async function getMember(id: string): Promise<Member | null> {
  const members = await loadMembers()
  return members[id] ?? null
}

export async function getMemberHistory(id: string): Promise<MonthlyReport[]> {
  const months = await getAvailableMonths()
  const sorted = months.slice().sort()
  const history: MonthlyReport[] = []
  for (const month of sorted) {
    const reports = await loadReport(month)
    const r = reports.find((x) => x.member_id === id)
    if (r) history.push(r)
  }
  return history
}

export async function getTreeData(month: string, rootMemberId?: string) {
  const [members, reports] = await Promise.all([loadMembers(), loadReport(month)])

  let visibleIds: Set<string> | null = null
  if (rootMemberId) {
    visibleIds = getSubtreeIds(rootMemberId, members)
  }

  return reports
    .filter((r) => !visibleIds || visibleIds.has(r.member_id))
    .map((r) => {
      const m = members[r.member_id]
      const uplineId =
        rootMemberId && m?.upline_id && !visibleIds?.has(m.upline_id)
          ? null
          : m?.upline_id ?? null
      const sponsorId = m?.sponsor_id ?? null
      return {
        id: r.member_id,
        name: m?.name ?? '',
        join_date: m?.join_date ?? '',
        country: m?.country ?? 'TH',
        upline_id: uplineId,
        sponsor_id: sponsorId,
        sponsor_name: sponsorId ? (members[sponsorId]?.name ?? '') : '',
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

// ── Subtree helpers (sync - works on already-loaded members map) ───────────────

export function getSubtreeIds(rootId: string, members: Record<string, Member>): Set<string> {
  const children: Record<string, string[]> = {}
  for (const m of Object.values(members)) {
    if (m.upline_id) {
      if (!children[m.upline_id]) children[m.upline_id] = []
      children[m.upline_id].push(m.id)
    }
  }
  const result = new Set<string>()
  const queue = [rootId]
  while (queue.length) {
    const id = queue.shift()!
    result.add(id)
    for (const child of children[id] ?? []) queue.push(child)
  }
  return result
}

export async function getMembersForMonthSubtree(
  month: string,
  rootMemberId: string
): Promise<(Member & { report: MonthlyReport })[]> {
  const [members, reports] = await Promise.all([loadMembers(), loadReport(month)])
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

export function bvToThb(bv: number): number {
  return bv * 25000 / 500
}

// ── Write helpers (for upload route) ─────────────────────────────────────────

function saveMembersLocal(incoming: Record<string, Member>): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  const existing = loadMembersLocal()
  const merged = { ...existing, ...incoming }
  fs.writeFileSync(MEMBERS_FILE, JSON.stringify(merged, null, 2), 'utf-8')
}

function saveReportLocal(month: string, reports: MonthlyReport[]): void {
  const reportsDir = path.join(DATA_DIR, 'reports')
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })
  fs.writeFileSync(reportFile(month), JSON.stringify(reports, null, 2), 'utf-8')

  // Update months index
  const months = getMonthsLocal()
  if (!months.includes(month)) {
    months.push(month)
    fs.writeFileSync(MONTHS_FILE, JSON.stringify(months, null, 2), 'utf-8')
  }
}

export async function upsertMembers(members: Record<string, Member>): Promise<void> {
  if (!USE_SUPABASE) {
    saveMembersLocal(members)
    return
  }
  const rows = Object.values(members)
  const batchSize = 200
  for (let i = 0; i < rows.length; i += batchSize) {
    await sbUpsert('members', rows.slice(i, i + batchSize))
  }
}

export async function upsertMonthlyReports(month: string, reports: MonthlyReport[]): Promise<void> {
  if (!USE_SUPABASE) {
    saveReportLocal(month, reports)
    return
  }
  const batchSize = 200
  for (let i = 0; i < reports.length; i += batchSize) {
    await sbUpsert('monthly_reports', reports.slice(i, i + batchSize))
  }
}
