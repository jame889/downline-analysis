import { NextResponse } from 'next/server'
import { getSession, ROOT_MEMBER_ID } from '@/lib/auth'
import { getAvailableMonths, getMembersForMonth } from '@/lib/db'
import { POSITION_RANK } from '@/lib/types'
import type { Position } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Simple linear regression: returns { slope, intercept }
function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 }
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumX2 += i * i
  }
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return { slope: 0, intercept: sumY / n }
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

function predict(reg: { slope: number; intercept: number }, x: number): number {
  return reg.intercept + reg.slope * x
}

function addMonths(monthStr: string, count: number): string {
  const [y, m] = monthStr.split('-').map(Number)
  const date = new Date(y, m - 1 + count, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// Determine projected rank based on volume thresholds
function projectedRank(volL: number, volR: number): string {
  const weakLeg = Math.min(volL, volR)
  // Simplified SPS rank thresholds (cumulative BV on weak leg)
  if (weakLeg >= 100000) return 'SV'
  if (weakLeg >= 30000) return 'ST'
  if (weakLeg >= 10000) return 'BR'
  return 'FA'
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const months = getAvailableMonths().slice().sort()

    const history: {
      month: string
      members: number
      bv: number
      activeRate: number
      volL: number
      volR: number
    }[] = []

    for (const month of months) {
      const data = getMembersForMonth(month)
      const totalMembers = data.length
      const activeMembers = data.filter((m) => m.report.is_active).length
      const totalBV = data.reduce((sum, m) => sum + (m.report.monthly_bv ?? 0), 0)
      const root = data.find((m) => m.id === ROOT_MEMBER_ID)

      history.push({
        month,
        members: totalMembers,
        bv: totalBV,
        activeRate: totalMembers > 0 ? Math.round((activeMembers / totalMembers) * 10000) / 100 : 0,
        volL: root?.report.total_vol_left ?? 0,
        volR: root?.report.total_vol_right ?? 0,
      })
    }

    // Run regressions
    const memberReg = linearRegression(history.map((h) => h.members))
    const bvReg = linearRegression(history.map((h) => h.bv))
    const activeRateReg = linearRegression(history.map((h) => h.activeRate))
    const volLReg = linearRegression(history.map((h) => h.volL))
    const volRReg = linearRegression(history.map((h) => h.volR))

    const n = history.length
    const lastMonth = months[months.length - 1]

    // Forecast 3 months forward
    const forecast: typeof history = []
    for (let i = 1; i <= 3; i++) {
      const futureMonth = addMonths(lastMonth, i)
      const idx = n - 1 + i
      forecast.push({
        month: futureMonth,
        members: Math.max(0, Math.round(predict(memberReg, idx))),
        bv: Math.max(0, Math.round(predict(bvReg, idx))),
        activeRate: Math.min(100, Math.max(0, Math.round(predict(activeRateReg, idx) * 100) / 100)),
        volL: Math.max(0, Math.round(predict(volLReg, idx))),
        volR: Math.max(0, Math.round(predict(volRReg, idx))),
      })
    }

    // Growth rates (per month averages)
    const memberGrowthRate = n > 1
      ? Math.round((memberReg.slope / (history[0].members || 1)) * 10000) / 100
      : 0
    const bvGrowthRate = n > 1
      ? Math.round((bvReg.slope / (history[0].bv || 1)) * 10000) / 100
      : 0
    const activeRateChange = n > 1
      ? Math.round(activeRateReg.slope * 100) / 100
      : 0

    // Projected rank for the last forecast month
    const lastForecast = forecast[forecast.length - 1]
    const projectedPosition = projectedRank(lastForecast.volL, lastForecast.volR)

    // Current rank
    const lastHistory = history[history.length - 1]
    const currentPosition = projectedRank(lastHistory.volL, lastHistory.volR)

    return NextResponse.json({
      history,
      forecast,
      trends: {
        memberGrowthRate,
        bvGrowthRate,
        activeRateChange,
      },
      rankProjection: {
        currentPosition,
        projectedPosition,
        projectedMonth: lastForecast.month,
        projectedVolL: lastForecast.volL,
        projectedVolR: lastForecast.volR,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to compute forecast' }, { status: 500 })
  }
}
