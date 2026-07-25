import { NextRequest, NextResponse } from 'next/server'
import {
  checkPassword,
  createToken, SESSION_COOKIE, ROOT_MEMBER_ID
} from '@/lib/auth'
import { getAllMembers } from '@/lib/db'
import { recordLoginActivity } from '@/lib/login-activity'
import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')

export async function POST(req: NextRequest) {
  const { memberId, password } = await req.json()

  if (!memberId || !password) {
    return NextResponse.json({ error: 'กรุณากรอกรหัสสมาชิกและรหัสผ่าน' }, { status: 400 })
  }

  const member = (await getAllMembers())[memberId]
  if (!member) {
    return NextResponse.json({ error: 'ไม่พบรหัสสมาชิกนี้' }, { status: 401 })
  }

  // Check if member is blocked
  const blockedFile = path.join(DATA_DIR, 'blocked.json')
  const blocked: Record<string, any> = fs.existsSync(blockedFile)
    ? JSON.parse(fs.readFileSync(blockedFile, 'utf-8'))
    : {}
  if (memberId in blocked) {
    return NextResponse.json({ error: 'บัญชีถูกระงับการใช้งาน' }, { status: 403 })
  }

  if (!checkPassword(memberId, password)) {
    return NextResponse.json({ error: 'รหัสผ่านไม่ถูกต้อง' }, { status: 401 })
  }

  const name = member.name
  const isAdmin = memberId === ROOT_MEMBER_ID

  const token = await createToken({ memberId, name, isAdmin })

  try {
    await recordLoginActivity({
      memberId,
      name,
      timestamp: new Date().toISOString(),
      ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown',
    })
  } catch (error) {
    console.warn('[auth/login] skipped activity log', error)
  }

  const res = NextResponse.json({ ok: true, isAdmin, name })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
  return res
}
