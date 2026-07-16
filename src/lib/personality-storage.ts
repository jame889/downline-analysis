import fs from 'fs'
import path from 'path'
import type { StoredPersonalityProfile } from '@/lib/personality'

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\n/g, '') ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\n/g, '') ?? ''
const BUCKET = process.env.PERSONALITY_BUCKET?.trim() || 'personality-profiles'
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY)

function safeMemberId(memberId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(memberId)) throw new Error('Invalid member ID')
  return memberId
}

function sbHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  }
}

function getProfileDir(): string {
  const base = process.env.PRIVATE_DATA_DIR?.trim()
    ? path.resolve(process.env.PRIVATE_DATA_DIR)
    : path.join(process.cwd(), 'data')
  return path.join(base, 'personality')
}

function ensureProfileDir(): string {
  const dir = getProfileDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function localPath(memberId: string): string {
  return path.join(ensureProfileDir(), `${safeMemberId(memberId)}.json`)
}

export async function loadPersonalityProfile(memberId: string): Promise<StoredPersonalityProfile | null> {
  const id = safeMemberId(memberId)
  if (USE_SUPABASE) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(id)}.json`, {
      headers: sbHeaders(),
      cache: 'no-store',
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Unable to load personality profile (${res.status})`)
    try { return await res.json() as StoredPersonalityProfile } catch { return null }
  }

  const file = localPath(id)
  if (!fs.existsSync(file)) return null
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as StoredPersonalityProfile } catch { return null }
}

export async function savePersonalityProfile(profile: StoredPersonalityProfile): Promise<void> {
  const id = safeMemberId(profile.memberId)
  const body = JSON.stringify(profile, null, 2)
  if (USE_SUPABASE) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(id)}.json`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'x-upsert': 'true' },
      body,
    })
    if (!res.ok) throw new Error(`Unable to save personality profile (${res.status})`)
    return
  }
  fs.writeFileSync(localPath(id), body, 'utf-8')
}

export async function deletePersonalityProfile(memberId: string): Promise<void> {
  const id = safeMemberId(memberId)
  if (USE_SUPABASE) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(id)}.json`, {
      method: 'DELETE',
      headers: sbHeaders(),
    })
    if (!res.ok && res.status !== 404) throw new Error(`Unable to delete personality profile (${res.status})`)
    return
  }
  const file = localPath(id)
  if (fs.existsSync(file)) fs.unlinkSync(file)
}
