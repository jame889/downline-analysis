import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAvailableMonths, getMembersForMonth } from '@/lib/db'
import { POSITION_RANK } from '@/lib/types'
import type { Position } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface LeaderboardEntry {
  rank: number
  id: string
  name: string
  position: string
  value: number
  delta?: number
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const months = getAvailableMonths().slice().sort()

    const requestedMonth = searchParams.get('month')
    const month = requestedMonth && months.includes(requestedMonth)
      ? requestedMonth
      : months[months.length - 1]

    if (!month) {
      return NextResponse.json({ error: 'No data available' }, { status: 404 })
    }

    const data = getMembersForMonth(month)
    const monthIdx = months.indexOf(month)
    const prevMonth = monthIdx > 0 ? months[monthIdx - 1] : null
    const prevData = prevMonth ? getMembersForMonth(prevMonth) : []

    const prevMap = new Map<string, (typeof prevData)[number]>()
    for (const m of prevData) prevMap.set(m.id, m)

    // Top BV
    const topBV: LeaderboardEntry[] = data
      .slice()
      .sort((a, b) => (b.report.monthly_bv ?? 0) - (a.report.monthly_bv ?? 0))
      .slice(0, 10)
      .map((m, i) => {
        const prev = prevMap.get(m.id)
        return {
          rank: i + 1,
          id: m.id,
          name: m.name,
          position: m.report.highest_position,
          value: m.report.monthly_bv ?? 0,
          delta: prev ? (m.report.monthly_bv ?? 0) - (prev.report.monthly_bv ?? 0) : undefined,
        }
      })

    // Top Recruiter: count new members whose upline_id = this member
    // New member = in current month but not in previous month
    const prevIds = new Set(prevData.map((m) => m.id))
    const recruitCounts = new Map<string, number>()
    for (const m of data) {
      if (!prevIds.has(m.id) && prevMonth) {
        // New member - credit their upline
        const uplineId = m.upline_id
        if (uplineId) {
          recruitCounts.set(uplineId, (recruitCounts.get(uplineId) ?? 0) + 1)
        }
      }
    }

    const dataMap = new Map<string, (typeof data)[number]>()
    for (const m of data) dataMap.set(m.id, m)

    const topRecruiter: LeaderboardEntry[] = Array.from(recruitCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count], i) => {
        const m = dataMap.get(id)
        return {
          rank: i + 1,
          id,
          name: m?.name ?? id,
          position: m?.report.highest_position ?? '',
          value: count,
        }
      })

    // Top Growth: BV growth rate vs previous month
    const topGrowth: LeaderboardEntry[] = prevMonth
      ? data
          .filter((m) => {
            const prev = prevMap.get(m.id)
            return prev && (prev.report.monthly_bv ?? 0) > 0
          })
          .map((m) => {
            const prev = prevMap.get(m.id)!
            const prevBV = prev.report.monthly_bv ?? 0
            const currBV = m.report.monthly_bv ?? 0
            const growthRate = prevBV > 0 ? ((currBV - prevBV) / prevBV) * 100 : 0
            return { member: m, growthRate, delta: currBV - prevBV }
          })
          .sort((a, b) => b.growthRate - a.growthRate)
          .slice(0, 10)
          .map((item, i) => ({
            rank: i + 1,
            id: item.member.id,
            name: item.member.name,
            position: item.member.report.highest_position,
            value: Math.round(item.growthRate * 100) / 100,
            delta: item.delta,
          }))
      : []

    // Fastest Rising: gained highest position rank this month vs previous
    const fastestRising: LeaderboardEntry[] = prevMonth
      ? data
          .filter((m) => {
            const prev = prevMap.get(m.id)
            if (!prev) return false
            const currRank = POSITION_RANK[m.report.highest_position as Position] ?? 0
            const prevRank = POSITION_RANK[prev.report.highest_position as Position] ?? 0
            return currRank > prevRank
          })
          .map((m) => {
            const prev = prevMap.get(m.id)!
            const currRank = POSITION_RANK[m.report.highest_position as Position] ?? 0
            const prevRank = POSITION_RANK[prev.report.highest_position as Position] ?? 0
            return {
              member: m,
              rankGain: currRank - prevRank,
              oldPos: prev.report.highest_position,
              newPos: m.report.highest_position,
            }
          })
          .sort((a, b) => b.rankGain - a.rankGain)
          .slice(0, 10)
          .map((item, i) => ({
            rank: i + 1,
            id: item.member.id,
            name: item.member.name,
            position: item.newPos,
            value: item.rankGain,
            delta: POSITION_RANK[item.newPos as Position] ?? 0,
          }))
      : []

    return NextResponse.json({
      month,
      topBV,
      topRecruiter,
      topGrowth,
      fastestRising,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to compute leaderboard' }, { status: 500 })
  }
}
