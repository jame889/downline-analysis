import { NextRequest, NextResponse } from 'next/server'
import { getAvailableMonths, getTreeData } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const months = getAvailableMonths()
    const month = searchParams.get('month') ?? months[0]
    const member = searchParams.get('member') ?? undefined

    if (!month) return NextResponse.json({ nodes: [], month: null })

    const nodes = getTreeData(month, member)
    return NextResponse.json({ nodes, month })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to load tree' }, { status: 500 })
  }
}
