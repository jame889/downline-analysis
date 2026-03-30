import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAvailableMonths, getMembersForMonth, getMember, getSubtreeIds } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const filterMember = searchParams.get('member')

    const months = getAvailableMonths().slice().sort()
    if (months.length < 2) {
      return NextResponse.json({ atRisk: [], recentlyLost: [], improving: [] })
    }

    // Optionally filter to a subtree
    let subtreeIds: Set<string> | null = null
    if (filterMember) {
      subtreeIds = getSubtreeIds(filterMember)
    }

    // Build per-member history across all months
    type MemberMonthData = {
      month: string
      bv: number
      isActive: boolean
      isQualified: boolean
    }
    const memberHistory = new Map<string, MemberMonthData[]>()
    const memberNames = new Map<string, string>()
    const memberUplines = new Map<string, string | null>()

    for (const month of months) {
      const data = getMembersForMonth(month)
      for (const m of data) {
        if (subtreeIds && !subtreeIds.has(m.id)) continue
        if (!memberHistory.has(m.id)) memberHistory.set(m.id, [])
        memberHistory.get(m.id)!.push({
          month,
          bv: m.report.monthly_bv ?? 0,
          isActive: m.report.is_active,
          isQualified: m.report.is_qualified,
        })
        memberNames.set(m.id, m.name)
        memberUplines.set(m.id, m.upline_id)
      }
    }

    const currentMonth = months[months.length - 1]
    const prevMonth = months[months.length - 2]

    const atRisk: {
      id: string
      name: string
      reason: string
      lastActiveBV: number
      currentBV: number
      monthsDecline: number
      upline_id: string | null
      upline_name: string
    }[] = []

    const recentlyLost: { id: string; name: string; lastMonth: string; lastBV: number }[] = []
    const improving: { id: string; name: string; previouslyInactive: boolean; currentBV: number }[] = []

    for (const [id, history] of Array.from(memberHistory.entries())) {
      const current = history.find((h) => h.month === currentMonth)
      const prev = history.find((h) => h.month === prevMonth)

      // Recently lost: was in previous month but not in current
      if (prev && !current) {
        recentlyLost.push({
          id,
          name: memberNames.get(id) ?? id,
          lastMonth: prevMonth,
          lastBV: prev.bv,
        })
        continue
      }

      if (!current) continue

      // Improving: was inactive in previous, active now
      if (prev && !prev.isActive && current.isActive) {
        improving.push({
          id,
          name: memberNames.get(id) ?? id,
          previouslyInactive: true,
          currentBV: current.bv,
        })
      }

      // At-risk checks
      const reasons: string[] = []
      let lastActiveBV = 0
      let monthsDecline = 0

      // 1. Was active but now inactive
      if (prev && prev.isActive && !current.isActive) {
        reasons.push('เคย Active แต่ตอนนี้ Inactive')
        lastActiveBV = prev.bv
      }

      // 2. BV declining for 2+ consecutive months
      if (history.length >= 2) {
        let declineCount = 0
        for (let i = history.length - 1; i >= 1; i--) {
          if (history[i].bv < history[i - 1].bv) {
            declineCount++
          } else {
            break
          }
        }
        if (declineCount >= 2) {
          reasons.push(`BV ลดลงต่อเนื่อง ${declineCount} เดือน`)
          monthsDecline = declineCount
          if (!lastActiveBV && history.length >= declineCount + 1) {
            lastActiveBV = history[history.length - 1 - declineCount].bv
          }
        }
      }

      // 3. Was qualified but lost qualification
      if (prev && prev.isQualified && !current.isQualified) {
        reasons.push('สูญเสีย Qualification')
      }

      if (reasons.length > 0) {
        const uplineId = memberUplines.get(id) ?? null
        const uplineMember = uplineId ? getMember(uplineId) : null
        atRisk.push({
          id,
          name: memberNames.get(id) ?? id,
          reason: reasons.join(', '),
          lastActiveBV: lastActiveBV || (prev?.bv ?? 0),
          currentBV: current.bv,
          monthsDecline,
          upline_id: uplineId,
          upline_name: uplineMember?.name ?? (uplineId ?? ''),
        })
      }
    }

    // Sort at-risk by months decline desc, then by current BV asc
    atRisk.sort((a, b) => b.monthsDecline - a.monthsDecline || a.currentBV - b.currentBV)

    return NextResponse.json({ atRisk, recentlyLost, improving })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to compute watchlist' }, { status: 500 })
  }
}
