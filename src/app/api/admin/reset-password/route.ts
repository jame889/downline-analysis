import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getMember } from '@/lib/db'
import { savePassword, validPassword } from '@/lib/password-store'

export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body.memberId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(body.memberId)) {
    return NextResponse.json({ error: 'Invalid memberId' }, { status: 400 })
  }
  const password = body.newPassword ?? body.memberId
  if (!validPassword(password)) return NextResponse.json({ error: 'Invalid password length' }, { status: 400 })
  try {
    if (!await getMember(body.memberId)) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    await savePassword(body.memberId, password, session.memberId)
    return NextResponse.json({ ok: true, persisted: true, memberId: body.memberId, isDefault: password === body.memberId })
  } catch {
    return NextResponse.json({ ok: false, error: 'Password persistence could not be confirmed' }, { status: 503 })
  }
}
