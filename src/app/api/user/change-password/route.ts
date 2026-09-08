import { NextRequest, NextResponse } from 'next/server'
import { getSession, checkPassword, passwordOverrideCookieName } from '@/lib/auth'
import { savePassword, validPassword } from '@/lib/password-store'

export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body.currentPassword !== 'string' || !validPassword(body.newPassword)) {
    return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร และไม่เกิน 1024 ไบต์' }, { status: 400 })
  }
  try {
    if (!await checkPassword(session.memberId, body.currentPassword)) {
      return NextResponse.json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, { status: 401 })
    }
    await savePassword(session.memberId, body.newPassword)
    const res = NextResponse.json({ ok: true, persisted: true })
    res.cookies.delete(passwordOverrideCookieName(session.memberId))
    return res
  } catch {
    return NextResponse.json({ ok: false, error: 'ยังยืนยันการบันทึกรหัสผ่านไม่ได้ กรุณาลองเข้าสู่ระบบด้วยรหัสใหม่ก่อนเปลี่ยนอีกครั้ง' }, { status: 503 })
  }
}
