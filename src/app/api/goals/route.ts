import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getSession } from '@/lib/auth'
import { getAvailableMonths, getMembersForMonth, getMember } from '@/lib/db'

export const dynamic = 'force-dynamic'

const DATA_DIR = path.join(process.cwd(), 'data')
const GOALS_FILE = path.join(DATA_DIR, 'goals.json')

interface Goal {
  targetVolLeft: number
  targetVolRight: number
  targetBV: number
  targetNewMembers: number
  createdAt: string
}

type GoalsData = Record<string, Record<string, Goal>>

function loadGoals(): GoalsData {
  if (!fs.existsSync(GOALS_FILE)) return {}
  return JSON.parse(fs.readFileSync(GOALS_FILE, 'utf-8'))
}

function saveGoals(data: GoalsData): void {
  fs.writeFileSync(GOALS_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const memberId = session.memberId
    const goals = loadGoals()
    const memberGoals = goals[memberId] ?? {}

    // Get current month data for progress calculation
    const months = getAvailableMonths()
    const currentMonth = months.length > 0 ? months[0] : null // months are sorted desc

    let progress = null
    if (currentMonth && memberGoals[currentMonth]) {
      const data = getMembersForMonth(currentMonth)
      const memberData = data.find((m) => m.id === memberId)
      const target = memberGoals[currentMonth]

      // Count new members this month (members whose upline_id is this member and first appeared this month)
      const prevMonths = months.filter((m) => m < currentMonth)
      const prevMemberIds = new Set<string>()
      for (const pm of prevMonths) {
        const pData = getMembersForMonth(pm)
        for (const m of pData) {
          prevMemberIds.add(m.id)
        }
      }
      const newMembers = data.filter(
        (m) => m.upline_id === memberId && !prevMemberIds.has(m.id)
      ).length

      const current = {
        volLeft: memberData?.report.total_vol_left ?? 0,
        volRight: memberData?.report.total_vol_right ?? 0,
        bv: memberData?.report.monthly_bv ?? 0,
        newMembers,
      }

      progress = {
        current,
        target: {
          volLeft: target.targetVolLeft,
          volRight: target.targetVolRight,
          bv: target.targetBV,
          newMembers: target.targetNewMembers,
        },
        progress: {
          volLeftPct: target.targetVolLeft > 0
            ? Math.round((current.volLeft / target.targetVolLeft) * 10000) / 100
            : 0,
          volRightPct: target.targetVolRight > 0
            ? Math.round((current.volRight / target.targetVolRight) * 10000) / 100
            : 0,
          bvPct: target.targetBV > 0
            ? Math.round((current.bv / target.targetBV) * 10000) / 100
            : 0,
          newMembersPct: target.targetNewMembers > 0
            ? Math.round((current.newMembers / target.targetNewMembers) * 10000) / 100
            : 0,
        },
      }
    }

    return NextResponse.json({ goals: memberGoals, progress })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to load goals' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { targetVolLeft, targetVolRight, targetBV, targetNewMembers, month } = body

    if (!month) {
      return NextResponse.json({ error: 'month is required' }, { status: 400 })
    }

    const goals = loadGoals()
    if (!goals[session.memberId]) {
      goals[session.memberId] = {}
    }

    goals[session.memberId][month] = {
      targetVolLeft: targetVolLeft ?? 0,
      targetVolRight: targetVolRight ?? 0,
      targetBV: targetBV ?? 0,
      targetNewMembers: targetNewMembers ?? 0,
      createdAt: new Date().toISOString(),
    }

    saveGoals(goals)

    return NextResponse.json({ success: true, goal: goals[session.memberId][month] })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to save goal' }, { status: 500 })
  }
}
