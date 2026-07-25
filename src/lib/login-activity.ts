import fs from 'fs'
import path from 'path'
import { hasSupabase, sbInsert, sbSelect } from '@/lib/supabase'

const LOCAL_PATH = path.join(process.cwd(), 'data', 'activity.json')
const PAGE_SIZE = 1000

export interface LoginActivity {
  memberId: string
  name: string
  timestamp: string
  ip: string
}

interface LoginActivityRow {
  member_id: string
  member_name: string
  logged_at: string
  ip: string
}

function loadLocal(): LoginActivity[] {
  try {
    if (!fs.existsSync(LOCAL_PATH)) return []
    const data = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf-8')) as { logins?: LoginActivity[] }
    return data.logins ?? []
  } catch {
    return []
  }
}

function saveLocal(logins: LoginActivity[]): void {
  fs.writeFileSync(LOCAL_PATH, JSON.stringify({ logins }, null, 2), 'utf-8')
}

export async function recordLoginActivity(activity: LoginActivity): Promise<void> {
  if (hasSupabase()) {
    await sbInsert('login_activity', {
      member_id: activity.memberId,
      member_name: activity.name,
      logged_at: activity.timestamp,
      ip: activity.ip,
    })
    return
  }

  const logins = loadLocal()
  logins.push(activity)
  saveLocal(logins.slice(-10000))
}

export async function loadLoginActivities(limit = 10000): Promise<LoginActivity[]> {
  if (!hasSupabase()) return loadLocal().slice(-limit).reverse()

  const results: LoginActivity[] = []
  for (let offset = 0; offset < limit; offset += PAGE_SIZE) {
    const pageLimit = Math.min(PAGE_SIZE, limit - offset)
    const rows = await sbSelect<LoginActivityRow>(
      'login_activity',
      `select=member_id,member_name,logged_at,ip&order=logged_at.desc&limit=${pageLimit}&offset=${offset}`
    )
    results.push(...rows.map((row) => ({
      memberId: row.member_id,
      name: row.member_name,
      timestamp: row.logged_at,
      ip: row.ip,
    })))
    if (rows.length < pageLimit) break
  }
  return results
}
