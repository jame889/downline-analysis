import { NextRequest, NextResponse } from 'next/server'
import { getAvailableMonths, getMembersForMonth } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const months = getAvailableMonths()
    const month = searchParams.get('month') ?? months[0]

    if (!month) return NextResponse.json({ members: [], month: null })

    const members = getMembersForMonth(month)
    return NextResponse.json({ members, month })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to load members' }, { status: 500 })
  }
}
