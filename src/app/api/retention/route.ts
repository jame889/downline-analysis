import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAvailableMonths, getMembersForMonth } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const months = getAvailableMonths().slice().sort()

    // Build per-month member ID sets and active sets
    const monthMemberIds: Map<string, Set<string>> = new Map()
    const monthActiveIds: Map<string, Set<string>> = new Map()

    for (const month of months) {
      const data = getMembersForMonth(month)
      const ids = new Set<string>()
      const activeIds = new Set<string>()
      for (const m of data) {
        ids.add(m.id)
        if (m.report.is_active) activeIds.add(m.id)
      }
      monthMemberIds.set(month, ids)
      monthActiveIds.set(month, activeIds)
    }

    // Determine first-seen month for each member (= their cohort)
    const firstSeen = new Map<string, string>()
    for (const month of months) {
      const ids = monthMemberIds.get(month)!
      for (const id of Array.from(ids)) {
        if (!firstSeen.has(id)) {
          firstSeen.set(id, month)
        }
      }
    }

    // Group members into cohorts by first-seen month
    const cohortMembers = new Map<string, string[]>()
    for (const [id, month] of Array.from(firstSeen.entries())) {
      if (!cohortMembers.has(month)) cohortMembers.set(month, [])
      cohortMembers.get(month)!.push(id)
    }

    // Build cohort retention
    const cohorts = Array.from(cohortMembers.entries()).map(([cohortMonth, memberIds]) => {
      const initialCount = memberIds.length
      const retention = months
        .filter((m) => m >= cohortMonth)
        .map((month) => {
          const activeSet = monthActiveIds.get(month)!
          const activeCount = memberIds.filter((id) => activeSet.has(id)).length
          return {
            month,
            activeCount,
            rate: initialCount > 0 ? Math.round((activeCount / initialCount) * 10000) / 100 : 0,
          }
        })

      return { month: cohortMonth, initialCount, retention }
    })

    // Overall retention per month
    const overall = months.map((month) => {
      const totalMembers = monthMemberIds.get(month)!.size
      const activeMembers = monthActiveIds.get(month)!.size
      return {
        month,
        totalMembers,
        activeMembers,
        retentionRate: totalMembers > 0 ? Math.round((activeMembers / totalMembers) * 10000) / 100 : 0,
      }
    })

    return NextResponse.json({ cohorts, overall })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to compute retention' }, { status: 500 })
  }
}
