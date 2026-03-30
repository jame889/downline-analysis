import { NextRequest, NextResponse } from 'next/server'
import { getSession, ROOT_MEMBER_ID } from '@/lib/auth'
import { getAvailableMonths, getMembersForMonth, getMember } from '@/lib/db'
import type { MonthlyReport } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const month1 = searchParams.get('month1')
    const month2 = searchParams.get('month2')

    if (!month1 || !month2) {
      return NextResponse.json({ error: 'month1 and month2 are required' }, { status: 400 })
    }

    const months = getAvailableMonths()
    if (!months.includes(month1) || !months.includes(month2)) {
      return NextResponse.json({ error: 'Invalid month(s)' }, { status: 400 })
    }

    const data1 = getMembersForMonth(month1)
    const data2 = getMembersForMonth(month2)

    const map1 = new Map<string, typeof data1[number]>()
    const map2 = new Map<string, typeof data2[number]>()
    for (const m of data1) map1.set(m.id, m)
    for (const m of data2) map2.set(m.id, m)

    // New members: in month2 but not month1
    const newMembers = Array.from(map2.entries())
      .filter(([id]) => !map1.has(id))
      .map(([, m]) => ({
        id: m.id,
        name: m.name,
        position: m.report.highest_position,
        bv: m.report.monthly_bv,
      }))

    // Lost members: in month1 but not month2
    const lostMembers = Array.from(map1.entries())
      .filter(([id]) => !map2.has(id))
      .map(([, m]) => ({
        id: m.id,
        name: m.name,
        position: m.report.highest_position,
        bv: m.report.monthly_bv,
      }))

    // Active status changes
    const activeChanged: { id: string; name: string; wasActive: boolean; isActive: boolean }[] = []
    // Position changes
    const positionChanged: { id: string; name: string; oldPos: string; newPos: string }[] = []

    for (const [id, m2] of Array.from(map2.entries())) {
      const m1 = map1.get(id)
      if (!m1) continue

      if (m1.report.is_active !== m2.report.is_active) {
        activeChanged.push({
          id,
          name: m2.name,
          wasActive: m1.report.is_active,
          isActive: m2.report.is_active,
        })
      }

      if (m1.report.highest_position !== m2.report.highest_position) {
        positionChanged.push({
          id,
          name: m2.name,
          oldPos: m1.report.highest_position,
          newPos: m2.report.highest_position,
        })
      }
    }

    // Root member volume comparison
    const root1 = map1.get(ROOT_MEMBER_ID)
    const root2 = map2.get(ROOT_MEMBER_ID)
    const volumeComparison = {
      month1: {
        L: root1?.report.total_vol_left ?? 0,
        R: root1?.report.total_vol_right ?? 0,
        BV: root1?.report.monthly_bv ?? 0,
      },
      month2: {
        L: root2?.report.total_vol_left ?? 0,
        R: root2?.report.total_vol_right ?? 0,
        BV: root2?.report.monthly_bv ?? 0,
      },
    }

    // Summary stats
    const m1BV = data1.reduce((sum, m) => sum + (m.report.monthly_bv ?? 0), 0)
    const m2BV = data2.reduce((sum, m) => sum + (m.report.monthly_bv ?? 0), 0)
    const summary = {
      month1Total: data1.length,
      month2Total: data2.length,
      month1Active: data1.filter((m) => m.report.is_active).length,
      month2Active: data2.filter((m) => m.report.is_active).length,
      month1BV: m1BV,
      month2BV: m2BV,
    }

    return NextResponse.json({
      newMembers,
      lostMembers,
      activeChanged,
      positionChanged,
      volumeComparison,
      summary,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to compare months' }, { status: 500 })
  }
}
