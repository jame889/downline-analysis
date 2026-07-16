import { NextRequest, NextResponse } from 'next/server'
import {
  checkPassword, getMemberName, memberExists,
  createToken, SESSION_COOKIE, ROOT_MEMBER_ID
} from '@/lib/auth'
import fs from 'fs'
import path from 'path'

const DATA_DIR = process.env.PRIVATE_DATA_DIR
  ? path.resolve(process.env.PRIVATE_DATA_DIR)
  : path.join(process.cwd(), 'data')

export async function POST(req: NextRequest) {
  let body: { memberId?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'ข้อมูลเข้าสู่ระบบไม่ถูกต้อง' }, { status: 400 })
  }

  const memberId = body.memberId?.trim() ?? ''
  const password = body.password ?? ''

  if (!memberId || !password) {
    return NextResponse.json({ error: 'กรุณากรอกรหัสสมาชิกและรหัสผ่าน' }, { status: 400 })
  }

  const blockedFile = path.join(DATA_DIR, 'blocked.json')
  const blocked: Record<string, unknown> = fs.existsSync(blockedFile)
    ? JSON.parse(fs.readFileSync(blockedFile, 'utf-8'))
    : {}

  // Use one generic response to avoid exposing whether an account exists,
  // is blocked, or has a password configured.
  if (!memberExists(memberId) || memberId in blocked || !checkPassword(memberId, password)) {
    return NextResponse.json({ error: 'รหัสสมาชิกหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 })
  }

  if (!ROOT_MEMBER_ID) {
    return NextResponse.json({ error: 'ระบบยังไม่ได้ตั้งค่าผู้ดูแล' }, { status: 503 })
  }

  const name = getMemberName(memberId)
  const isAdmin = memberId === ROOT_MEMBER_ID
  const token = await createToken({ memberId, name, isAdmin })

  // Keep only the minimum audit data. Do not store IP addresses or member names.
  const activityFile = path.join(DATA_DIR, 'activity.json')
  const activity = fs.existsSync(activityFile)
    ? JSON.parse(fs.readFileSync(activityFile, 'utf-8'))
    : { logins: [] }
  activity.logins.push({ memberId, timestamp: new Date().toISOString() })
  if (activity.logins.length > 1000) activity.logins = activity.logins.slice(-1000)
  fs.writeFileSync(activityFile, JSON.stringify(activity))

  const res = NextResponse.json({ ok: true, isAdmin, name })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 12,
    path: '/',
  })
  return res
}
