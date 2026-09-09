import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import fs from 'fs'
import path from 'path'
import { hasSupabase, sbSelect, sbUpsert } from './supabase'

const N = 131072, R = 8, P = 1
const FILE = path.join(process.cwd(), 'data', 'passwords.json')
export function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 6 && Buffer.byteLength(value, 'utf8') <= 1024
}
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N, r: R, p: P, maxmem: 192 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key)))
}
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || !password.length || Buffer.byteLength(password, 'utf8') > 1024) throw new Error('Invalid password length')
  const salt = randomBytes(16).toString('hex')
  return `scrypt$${N}$${R}$${P}$${salt}$${(await derive(password, salt)).toString('hex')}`
}
export async function verifyStoredPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 1024) return false
  if (!stored.startsWith('scrypt$')) {
    // Existing plaintext records are upgraded only after a successful login.
    const actual = Buffer.from(password), expected = Buffer.from(stored)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[1] !== String(N) || parts[2] !== String(R) || parts[3] !== String(P)
    || !/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return false
  return timingSafeEqual(await derive(password, parts[4]), Buffer.from(parts[5], 'hex'))
}
function readLocal(): Record<string, string> {
  if (process.env.VERCEL) throw new Error('Durable password database is required')
  return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {}
}
export async function getStoredPassword(memberId: string): Promise<string | null> {
  if (!hasSupabase()) return readLocal()[memberId] ?? null
  const rows = await sbSelect<{password: string}>('passwords', `member_id=eq.${encodeURIComponent(memberId)}&select=password&limit=1`)
  return rows[0]?.password ?? null
}
export async function savePassword(memberId: string, password: string, resetBy?: string): Promise<void> {
  const hash = await hashPassword(password)
  if (hasSupabase()) {
    // The credential is authoritative; never report success if its durable write fails.
    await sbUpsert('passwords', { member_id: memberId, password: hash })
    await sbUpsert('password_meta', {
      member_id: memberId, changed_at: new Date().toISOString(), is_default: password === memberId, reset_by: resetBy ?? null,
    })
    return
  }
  const values = readLocal()
  values[memberId] = hash
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  const temporary = `${FILE}.${randomBytes(6).toString('hex')}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(values), { mode: 0o600 })
  fs.renameSync(temporary, FILE)
}
