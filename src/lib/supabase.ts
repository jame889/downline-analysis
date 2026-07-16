/**
 * Lightweight Supabase REST client (no extra package needed).
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

function headers(extra?: Record<string, string>) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

/** SELECT rows: params example "member_id=eq.900057&select=password" */
export async function sbSelect<T>(table: string, params = ''): Promise<T[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}${params ? `?${params}` : ''}`
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) throw new Error(`sbSelect ${table}: ${await res.text()}`)
  return res.json() as Promise<T[]>
}

/** UPSERT rows with merge-on-conflict semantics. */
export async function sbUpsert<T>(table: string, data: object | object[]): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation,resolution=merge-duplicates' }),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`sbUpsert ${table}: ${await res.text()}`)
  return res.json() as Promise<T[]>
}

/** INSERT a single row. */
export async function sbInsert(table: string, data: object): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`sbInsert ${table}: ${await res.text()}`)
}

/** DELETE rows matching params: params example "member_id=eq.900057" */
export async function sbDelete(table: string, params: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'DELETE',
    headers: headers(),
  })
  if (!res.ok) throw new Error(`sbDelete ${table}: ${await res.text()}`)
}
