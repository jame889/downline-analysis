import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
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
  if (!session.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { memberId, newPassword } = await req.json()
  if (!memberId) return NextResponse.json({ error: 'Missing memberId' }, { status: 400 })

  const pwFile = path.join(DATA_DIR, 'passwords.json')
  const metaFile = path.join(DATA_DIR, 'password_meta.json')

  const passwords = safeRead<Record<string, string>>(pwFile, {})
  const meta = safeRead<Record<string, any>>(metaFile, {})

  const pw = newPassword ?? memberId
  passwords[memberId] = pw
  meta[memberId] = { changedAt: new Date().toISOString(), isDefault: !newPassword, resetBy: session.memberId }

  fs.writeFileSync(pwFile, JSON.stringify(passwords, null, 2))
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2))

  return NextResponse.json({ ok: true, memberId, isDefault: !newPassword })
}
