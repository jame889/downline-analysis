import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const SECRET_TEXT = process.env.JWT_SECRET ?? 'downline-sps-secret-key-2026-internal'
const SECRET = new TextEncoder().encode(SECRET_TEXT)

export const SESSION_COOKIE = 'dl_session'
export const PASSWORD_COOKIE_PREFIX = 'dl_pw_'
export const ROOT_MEMBER_ID = process.env.NEXT_PUBLIC_ROOT_MEMBER_ID ?? '900057'

export interface SessionPayload {
  memberId: string
  name: string
  isAdmin: boolean
}

// ── JWT ────────────────────────────────────────────────────────────────────

export async function createToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET)
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifyToken(token)
}

// ── Password check ─────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data')

export function passwordOverrideCookieName(memberId: string): string {
  return `${PASSWORD_COOKIE_PREFIX}${memberId.replace(/[^a-zA-Z0-9_-]/g, '')}`
}

export function createPasswordOverrideValue(memberId: string, password: string): string {
  const changedAt = Date.now().toString(36)
  const hash = crypto
    .createHmac('sha256', SECRET_TEXT)
    .update(`${memberId}:${password}`)
    .digest('base64url')
  return `v1.${changedAt}.${hash}`
}

function passwordOverrideMatches(memberId: string, password: string): boolean | null {
  const value = cookies().get(passwordOverrideCookieName(memberId))?.value
  if (!value) return null
  const [, , hash] = value.split('.')
  if (!hash) return null
  const expected = createPasswordOverrideValue(memberId, password).split('.')[2]
  return hash === expected
}

export function checkPassword(memberId: string, password: string): boolean {
  const pwFile = path.join(DATA_DIR, 'passwords.json')
  if (fs.existsSync(pwFile)) {
    const passwords: Record<string, string> = JSON.parse(fs.readFileSync(pwFile, 'utf-8'))
    if (memberId in passwords) return passwords[memberId] === password
  }
  const override = passwordOverrideMatches(memberId, password)
  if (override !== null) return override
  // Default password = member_id
  return password === memberId
}

export function getMemberName(memberId: string): string {
  const mFile = path.join(DATA_DIR, 'members.json')
  if (!fs.existsSync(mFile)) return memberId
  const members: Record<string, { name: string }> = JSON.parse(fs.readFileSync(mFile, 'utf-8'))
  return members[memberId]?.name ?? memberId
}

export function memberExists(memberId: string): boolean {
  const mFile = path.join(DATA_DIR, 'members.json')
  if (!fs.existsSync(mFile)) return false
  const members: Record<string, unknown> = JSON.parse(fs.readFileSync(mFile, 'utf-8'))
  return memberId in members
}
