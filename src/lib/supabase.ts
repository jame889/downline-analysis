/** Server-only REST access. Reads are live and explicitly paginated. */
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export function hasSupabase(): boolean { return Boolean(SUPABASE_URL && SUPABASE_KEY) }
export class SupabaseError extends Error {
  constructor(public status: number, public code: string, table: string) {
    super(`Database operation failed for ${table} (${status}, ${code})`)
  }
}
function headers(extra?: Record<string, string>) {
  if (!hasSupabase()) throw new Error('Database is not configured')
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...extra }
}
async function assertOk(response: Response, table: string) {
  if (response.ok) return
  const payload = await response.json().catch(() => ({})) as { code?: string }
  throw new SupabaseError(response.status, payload.code ?? 'unknown', table)
}
const primaryOrder: Record<string, string> = {
  members: 'id', monthly_reports: 'month,member_id', business_report_snapshots: 'month',
  daily_activities: 'id', login_activity: 'logged_at,member_id', business_report_sync_status: 'singleton',
  telegram_processed_updates: 'update_id', telegram_deliveries: 'delivery_key',
}
export async function sbSelect<T>(table: string, params = ''): Promise<T[]> {
  const query = new URLSearchParams(params)
  if (!query.has('order')) query.set('order', primaryOrder[table] ?? 'member_id')
  const requestedLimit = query.has('limit') ? Number(query.get('limit')) : Infinity
  let offset = Number(query.get('offset') ?? 0)
  if ((requestedLimit !== Infinity && (!Number.isSafeInteger(requestedLimit) || requestedLimit < 0))
    || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid pagination parameters')
  const result: T[] = []
  while (result.length < requestedLimit) {
    const limit = Math.min(1000, requestedLimit - result.length)
    query.set('limit', String(limit)); query.set('offset', String(offset))
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: headers({ Prefer: 'count=exact' }), cache: 'no-store', signal: AbortSignal.timeout(15000),
    })
    await assertOk(res, table)
    const page = await res.json() as T[]
    if (!Array.isArray(page)) throw new Error(`Invalid database response for ${table}`)
    result.push(...page); offset += page.length
    const total = Number(res.headers.get('content-range')?.split('/')[1] ?? NaN)
    if (!page.length || (Number.isFinite(total) && offset >= total)) break
    // With unknown totals continue until an empty page: server caps may be below 1000.
  }
  return result
}
export async function sbUpsert<T>(table: string, data: object | object[]): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: headers({ Prefer: 'return=representation,resolution=merge-duplicates' }),
    body: JSON.stringify(data), cache: 'no-store', signal: AbortSignal.timeout(20000),
  })
  await assertOk(res, table); return res.json() as Promise<T[]>
}
export async function sbInsert(table: string, data: object): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: headers({ Prefer: 'return=minimal' }), body: JSON.stringify(data),
    cache: 'no-store', signal: AbortSignal.timeout(15000),
  })
  await assertOk(res, table)
}
export async function sbPatch<T>(table: string, params: string, data: object): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'PATCH', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(data),
    cache: 'no-store', signal: AbortSignal.timeout(15000),
  })
  await assertOk(res, table); return res.json() as Promise<T[]>
}
export async function sbDelete(table: string, params: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'DELETE', headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(15000),
  })
  await assertOk(res, table)
}
export async function sbDeleteReturning<T>(table: string, params: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'DELETE', headers: headers({ Prefer: 'return=representation' }), cache: 'no-store', signal: AbortSignal.timeout(15000),
  })
  await assertOk(res, table); return res.json() as Promise<T[]>
}
