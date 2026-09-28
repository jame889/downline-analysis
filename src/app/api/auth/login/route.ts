import { after, NextRequest, NextResponse } from 'next/server'
import {
  checkPasswordDetailed,
  createToken,
  getAuthMember,
  migrateVerifiedPassword,
  SESSION_COOKIE,
  ROOT_MEMBER_ID,
  passwordOverrideCookieName,
} from '@/lib/auth'
import { getAllMembers } from '@/lib/db'
import { recordLoginActivity } from '@/lib/login-activity'
import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')

export async function POST(req: NextRequest) {
  try {
  const { memberId, password } = await req.json()

  if (typeof memberId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(memberId) || typeof password !== 'string' || !password || password.length > 1024) {
    return NextResponse.json({ error: 'กรุณากรอกรหัสสมาชิกและรหัสผ่าน' }, { status: 400 })
  }

  // Fast path: most members are bundled with the app, so avoid loading the
  // full cloud member/report model during login. Cloud lookup remains as a fallback
  // for members added after the latest deployment.
  let member = getAuthMember(memberId)
  if (!member) {
    const cloudMember = (await getAllMembers())[memberId]
    if (!cloudMember) {
      return NextResponse.json({ error: 'ไม่พบรหัสสมาชิกนี้' }, { status: 401 })
    }
    member = { name: cloudMember.name ?? memberId }
  }

  // Check if member is blocked
  const blockedFile = path.join(DATA_DIR, 'blocked.json')
  const blocked: Record<string, any> = fs.existsSync(blockedFile)
    ? JSON.parse(fs.readFileSync(blockedFile, 'utf-8'))
    : {}
  if (memberId in blocked) {
    return NextResponse.json({ error: 'บัญชีถูกระงับการใช้งาน' }, { status: 403 })
  }

  const passwordCheck = await checkPasswordDetailed(memberId, password)
  if (!passwordCheck.matches) {
    return NextResponse.json({ error: 'รหัสผ่านไม่ถูกต้อง' }, { status: 401 })
  }

  const name = member.name
  const isAdmin = memberId === ROOT_MEMBER_ID
  const token = await createToken({ memberId, name, isAdmin })

  // Password migration and activity logging are durable but not required to
  // complete the login response. Run them after the response so users do not
  // wait on extra database writes or a rehash.
  const loginActivity = {
    memberId,
    name,
    timestamp: new Date().toISOString(),
    ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown',
  }
  after(async () => {
    const tasks: Promise<unknown>[] = [
      recordLoginActivity(loginActivity).catch((error) => {
        console.warn('[auth/login] skipped activity log', error)
      }),
    ]
    if (passwordCheck.needsMigration) {
      tasks.push(
        migrateVerifiedPassword(memberId, password).catch((error) => {
          console.warn('[auth/login] password migration deferred but failed', error)
        })
      )
    }
    await Promise.all(tasks)
  })

  const res = NextResponse.json({ ok: true, isAdmin, name })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
  res.cookies.delete(passwordOverrideCookieName(memberId))
  return res
  } catch (error) {
    console.error('[auth/login] request failed', error)
    return NextResponse.json(
      { error: 'ระบบเข้าสู่ระบบไม่พร้อมใช้งาน กรุณาลองใหม่' },
      { status: 503 }
    )
  }
}
