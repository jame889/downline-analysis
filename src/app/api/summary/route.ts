import { NextResponse } from 'next/server'
import {
  getAvailableMonths, getMonthlySummaries, getMembersForMonth, bvToThb
} from '@/lib/db'
import { ROOT_MEMBER_ID } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const months = getAvailableMonths()
    const summaries = getMonthlySummaries()

    // Build per-month root member L/R data for the admin dashboard
    const rootLR = months.slice().sort().map((month) => {
      const members = getMembersForMonth(month)
      const root = members.find((m) => m.id === ROOT_MEMBER_ID)
      return {
        month,
        vol_left: root?.report.total_vol_left ?? 0,
        vol_right: root?.report.total_vol_right ?? 0,
        vol_left_thb: bvToThb(root?.report.total_vol_left ?? 0),
        vol_right_thb: bvToThb(root?.report.total_vol_right ?? 0),
        curr_vol_left: root?.report.current_month_vol_left ?? 0,
        curr_vol_right: root?.report.current_month_vol_right ?? 0,
        weak_leg: Math.min(root?.report.total_vol_left ?? 0, root?.report.total_vol_right ?? 0),
        weak_leg_thb: bvToThb(Math.min(root?.report.total_vol_left ?? 0, root?.report.total_vol_right ?? 0)),
      }
    })

    return NextResponse.json({ months, summaries, rootLR })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to load summary' }, { status: 500 })
  }
}
