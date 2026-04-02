/**
 * GET /api/team-focus?member=XXX&month=YYYY
 *
 * Returns the left/right binary-tree subtrees for any member as the focus root.
 * Uses analyzeDownline (src/lib/analyzer.ts) which fixes:
 *   - Bug 1: re-runs analysis with the requested member as root (not 0)
 *   - Bug 2: output sorted by depth (closest to root first)
 *   - Bug 3: correct upline-chain traversal using raw member data
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAvailableMonths } from '@/lib/db'
import { analyzeDownline } from '@/lib/analyzer'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const DATA_DIR = path.join(process.cwd(), 'data')

function loadMembersRaw(): Record<string, {
  id: string; name: string; upline_id: string | null; sponsor_id: string | null
}> {
  const f = path.join(DATA_DIR, 'members.json')
  if (!fs.existsSync(f)) return {}
  return JSON.parse(fs.readFileSync(f, 'utf-8'))
}

function loadReport(month: string): Array<{
  member_id: string; level: number; highest_position: string
  is_active: boolean; monthly_bv: number
  total_vol_left: number; total_vol_right: number
}> {
  const f = path.join(DATA_DIR, 'reports', `${month}.json`)
  if (!fs.existsSync(f)) return []
  return JSON.parse(fs.readFileSync(f, 'utf-8'))
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const memberId = searchParams.get('member')
  if (!memberId) return NextResponse.json({ error: 'member param required' }, { status: 400 })

  try {
    const months = await getAvailableMonths()
    const month = searchParams.get('month') ?? months[0]
    if (!month) return NextResponse.json({ error: 'No data available' }, { status: 404 })

    const allMembersRaw = loadMembersRaw()
    const reports = loadReport(month)

    if (!allMembersRaw[memberId]) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // Build allNodes: monthly report data enriched with member name
    const allNodes = reports.map((r) => ({
      id:               r.member_id,
      name:             allMembersRaw[r.member_id]?.name ?? r.member_id,
      level:            r.level,
      highest_position: r.highest_position,
      is_active:        r.is_active ? 1 : 0,
      monthly_bv:       r.monthly_bv,
      total_vol_left:   r.total_vol_left,
      total_vol_right:  r.total_vol_right,
    }))

    // Bug 1 fix: pass memberId as root so analysis is relative to THAT member
    const { left, right } = analyzeDownline(memberId, allNodes, allMembersRaw)

    return NextResponse.json({
      month,
      member: {
        id:   memberId,
        name: allMembersRaw[memberId]?.name ?? memberId,
      },
      left,   // Bug 2: already BFS-sorted (closest to root first)
      right,
    })
  } catch (err) {
    console.error('[team-focus]', err)
    return NextResponse.json({ error: 'Failed to analyze team' }, { status: 500 })
  }
}
