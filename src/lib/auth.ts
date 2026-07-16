import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { scryptSync, timingSafeEqual } from 'crypto'
import fs from 'fs'
import path from 'path'

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET?.trim()
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters')
  return new TextEncoder().encode(secret)
}

export const SESSION_COOKIE = 'dl_session'
export const ROOT_MEMBER_ID = process.env.ROOT_MEMBER_ID ?? process.env.NEXT_PUBLIC_ROOT_MEMBER_ID ?? ''

export interface SessionPayload {
  memberId: string
  name: string
  isAdmin: boolean
}

export async function createToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
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

const DATA_DIR = process.env.PRIVATE_DATA_DIR
  ? path.resolve(process.env.PRIVATE_DATA_DIR)
  : path.join(process.cwd(), 'data')

function readRecord<T>(filename: string): Record<string, T> {
  const file = path.join(DATA_DIR, filename)
  if (!fs.existsSync(file)) return {}
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, T>
  } catch {
    return {}
  }
}

function verifyScrypt(password: string, stored: string): boolean {
  const [prefix, saltHex, hashHex] = stored.split('$')
  if (prefix !== 'scrypt' || !saltHex || !hashHex) return false
  try {
    const expected = Buffer.from(hashHex, 'hex')
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
    return expected.length > 0 && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function checkPassword(memberId: string, password: string): boolean {
  const stored = readRecord<string>('passwords.json')[memberId]
  if (!stored) return false
  if (stored.startsWith('scrypt$')) return verifyScrypt(password, stored)
  if (process.env.ALLOW_LEGACY_PLAINTEXT_PASSWORDS === 'true') {
    const a = Buffer.from(password)
    const b = Buffer.from(stored)
    return a.length === b.length && timingSafeEqual(a, b)
  }
  return false
}

export function getMemberName(memberId: string): string {
  return readRecord<{ name?: string }>('members.json')[memberId]?.name ?? memberId
}

export function memberExists(memberId: string): boolean {
  return memberId in readRecord<unknown>('members.json')
}
