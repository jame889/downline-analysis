import { NextRequest, NextResponse } from 'next/server'
import { getSession, checkPassword } from '@/lib/auth'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'
const DATA_DIR = path.join(process.cwd(), 'data')

function safeRead<T>(file: string, fallback: T): T {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : fallback }
  catch { return fallback }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { currentPassword, newPassword } = await req.json()
  if (!currentPassword || !newPassword) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (newPassword.length < 6) return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 })

  if (!checkPassword(session.memberId, currentPassword)) {
    return NextResponse.json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, { status: 401 })
  }

  const pwFile = path.join(DATA_DIR, 'passwords.json')
  const metaFile = path.join(DATA_DIR, 'password_meta.json')
  const passwords = safeRead<Record<string, string>>(pwFile, {})
  const meta = safeRead<Record<string, any>>(metaFile, {})

  passwords[session.memberId] = newPassword
  meta[session.memberId] = { changedAt: new Date().toISOString(), isDefault: false }

  fs.writeFileSync(pwFile, JSON.stringify(passwords, null, 2))
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2))

  return NextResponse.json({ ok: true })
}
