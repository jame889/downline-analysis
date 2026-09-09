import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { getStoredPassword, savePassword, verifyStoredPassword } from './password-store'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getBundledHistoryMembers } from './history-db'

const SECRET_TEXT = process.env.JWT_SECRET ?? ''
const SECRET = new TextEncoder().encode(SECRET_TEXT)

export const SESSION_COOKIE = 'dl_session'
export const PASSWORD_COOKIE_PREFIX = 'dl_pw_'
export const ROOT_MEMBER_ID = process.env.NEXT_PUBLIC_ROOT_MEMBER_ID ?? '900057'
const ROOT_INITIAL_PASSWORD = process.env.ROOT_INITIAL_PASSWORD ?? ROOT_MEMBER_ID

export interface SessionPayload {
  memberId: string
  name: string
  isAdmin: boolean
}

// ── JWT ────────────────────────────────────────────────────────────────────

export async function createToken(payload: SessionPayload): Promise<string> {
  if (SECRET_TEXT.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters')
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET)
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    if (SECRET_TEXT.length < 32) return null
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] })
    if (typeof payload.memberId !== 'string' || typeof payload.isAdmin !== 'boolean') return null
    if (payload.isAdmin && payload.memberId !== ROOT_MEMBER_ID) return null
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifyToken(token)
}

// ── Password check ─────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data')

function loadAuthMembers(): Record<string, { name?: string }> {
  const mFile = path.join(DATA_DIR, 'members.json')
  const legacy: Record<string, { name?: string }> = fs.existsSync(mFile)
    ? JSON.parse(fs.readFileSync(mFile, 'utf-8'))
    : {}

  // Keep authentication in sync with the member data used by the dashboard.
  // Bundled history contains newer members that may not exist in members.json.
  return { ...legacy, ...getBundledHistoryMembers() }
}

export function passwordOverrideCookieName(memberId: string): string {
  return `${PASSWORD_COOKIE_PREFIX}${memberId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export function createPasswordOverrideValue(memberId: string, password: string): string {
  const changedAt = Date.now().toString(36)
  const hash = crypto
    .createHmac('sha256', SECRET_TEXT)
    .update(`${memberId}:${password}`)
    .digest('base64url')
  return `v1.${changedAt}.${hash}`
}

async function passwordOverrideMatches(memberId: string, password: string): Promise<boolean | null> {
  const value = (await cookies()).get(passwordOverrideCookieName(memberId))?.value
  if (!value) return null
  const [, , hash] = value.split('.')
  if (!hash) return null
  const expected = createPasswordOverrideValue(memberId, password).split('.')[2]
  return hash === expected
}

export async function checkPassword(memberId: string, password: string): Promise<boolean> {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 1024) return false
  // Database errors must propagate: never fall back to an initial password on read failure.
  const stored = await getStoredPassword(memberId)
  if (stored !== null) {
    const matches = await verifyStoredPassword(password, stored)
    if (matches && !stored.startsWith('scrypt$')) await savePassword(memberId, password)
    return matches
  }
  // One-time migration for users of the former browser-local password override.
  const legacyMatch = await passwordOverrideMatches(memberId, password)
  if (legacyMatch !== null) {
    if (legacyMatch) await savePassword(memberId, password)
    return legacyMatch
  }
  const initial = memberId === ROOT_MEMBER_ID ? ROOT_INITIAL_PASSWORD : memberId
  if (process.env.VERCEL && memberId === ROOT_MEMBER_ID && !process.env.ROOT_INITIAL_PASSWORD) {
    throw new Error('Root credential is not configured')
  }
  return verifyStoredPassword(password, initial)
}

export function getMemberName(memberId: string): string {
  const members = loadAuthMembers()
  return members[memberId]?.name ?? memberId
}

export function memberExists(memberId: string): boolean {
  const members = loadAuthMembers()
  return memberId in members
}
