import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getMember } from '@/lib/db'
import { isMbtiType, type MbtiType } from '@/lib/mbti'
import { saveMemberMbti } from '@/lib/member-mbti'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { memberId, mbti } = await req.json() as { memberId?: string; mbti?: string | null }
    if (!memberId) {
      return NextResponse.json({ error: 'กรุณาระบุสมาชิก' }, { status: 400 })
    }

    const candidate = mbti?.trim().toUpperCase() || null
    let normalizedMbti: MbtiType | null = null
    if (candidate) {
      if (!isMbtiType(candidate)) {
        return NextResponse.json({ error: 'ประเภท MBTI ไม่ถูกต้อง' }, { status: 400 })
      }
      normalizedMbti = candidate
    }

    const member = await getMember(memberId)
    if (!member) return NextResponse.json({ error: 'ไม่พบสมาชิก' }, { status: 404 })

    await saveMemberMbti(memberId, normalizedMbti)
    return NextResponse.json({ ok: true, memberId, mbti: normalizedMbti })
  } catch (error) {
    console.error('[member-mbti]', error)
    return NextResponse.json({ error: 'ไม่สามารถบันทึก MBTI ได้' }, { status: 500 })
  }
}
