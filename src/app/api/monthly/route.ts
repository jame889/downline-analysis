import { NextRequest, NextResponse } from 'next/server'
import { getMemberHistory, getMember } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const member = getMember(id)
    const history = getMemberHistory(id)
    return NextResponse.json({ member, history })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 })
  }
}
