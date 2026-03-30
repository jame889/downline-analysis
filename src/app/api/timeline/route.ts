import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getMember, getMemberHistory, getAvailableMonths, getMembersForMonth } from '@/lib/db'
import { POSITION_RANK, POSITION_LABEL } from '@/lib/types'
import type { Position } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface TimelineEvent {
  date: string
  type: 'join' | 'position_up' | 'position_down' | 'became_active' | 'became_inactive' | 'qualified' | 'lost_qualified' | 'bv_milestone' | 'new_downline'
  title: string
  detail: string
  icon: string
}

// BV milestones to track
const BV_MILESTONES = [100, 500, 1000, 5000, 10000, 50000]

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const memberId = searchParams.get('id') ?? session.memberId

    const member = getMember(memberId)
    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const history = getMemberHistory(memberId)
    const events: TimelineEvent[] = []

    // Join event
    if (member.join_date) {
      events.push({
        date: member.join_date,
        type: 'join',
        title: 'เข้าร่วม SPS',
        detail: `สมัครเป็นสมาชิก SPS (ID: ${member.id})`,
        icon: '🎉',
      })
    }

    // Track milestones already hit
    const hitMilestones = new Set<number>()
    let prevReport = null

    for (const report of history) {
      if (prevReport) {
        // Position changes
        const prevRank = POSITION_RANK[prevReport.highest_position as Position] ?? 0
        const currRank = POSITION_RANK[report.highest_position as Position] ?? 0

        if (currRank > prevRank) {
          events.push({
            date: report.month,
            type: 'position_up',
            title: `เลื่อนตำแหน่งเป็น ${POSITION_LABEL[report.highest_position as Position] ?? report.highest_position}`,
            detail: `จาก ${POSITION_LABEL[prevReport.highest_position as Position] ?? prevReport.highest_position} เป็น ${POSITION_LABEL[report.highest_position as Position] ?? report.highest_position}`,
            icon: '⬆️',
          })
        } else if (currRank < prevRank) {
          events.push({
            date: report.month,
            type: 'position_down',
            title: `ตำแหน่งลดลงเป็น ${POSITION_LABEL[report.highest_position as Position] ?? report.highest_position}`,
            detail: `จาก ${POSITION_LABEL[prevReport.highest_position as Position] ?? prevReport.highest_position} เป็น ${POSITION_LABEL[report.highest_position as Position] ?? report.highest_position}`,
            icon: '⬇️',
          })
        }

        // Active status changes
        if (!prevReport.is_active && report.is_active) {
          events.push({
            date: report.month,
            type: 'became_active',
            title: 'กลับมา Active',
            detail: `BV: ${report.monthly_bv}`,
            icon: '✅',
          })
        } else if (prevReport.is_active && !report.is_active) {
          events.push({
            date: report.month,
            type: 'became_inactive',
            title: 'หยุด Active',
            detail: `BV ลดจาก ${prevReport.monthly_bv} เป็น ${report.monthly_bv}`,
            icon: '⚠️',
          })
        }

        // Qualification changes
        if (!prevReport.is_qualified && report.is_qualified) {
          events.push({
            date: report.month,
            type: 'qualified',
            title: 'ได้รับ Qualification',
            detail: `ผ่านเงื่อนไข Qualified ประจำเดือน`,
            icon: '🏆',
          })
        } else if (prevReport.is_qualified && !report.is_qualified) {
          events.push({
            date: report.month,
            type: 'lost_qualified',
            title: 'สูญเสีย Qualification',
            detail: `ไม่ผ่านเงื่อนไข Qualified ประจำเดือน`,
            icon: '❌',
          })
        }
      }

      // BV milestones
      for (const milestone of BV_MILESTONES) {
        if (report.monthly_bv >= milestone && !hitMilestones.has(milestone)) {
          hitMilestones.add(milestone)
          events.push({
            date: report.month,
            type: 'bv_milestone',
            title: `BV ถึง ${milestone.toLocaleString()}`,
            detail: `Monthly BV: ${report.monthly_bv.toLocaleString()}`,
            icon: '💎',
          })
        }
      }

      prevReport = report
    }

    // Check for new downlines each month
    const months = getAvailableMonths().slice().sort()
    const seenDownlines = new Set<string>()

    for (const month of months) {
      const data = getMembersForMonth(month)
      for (const m of data) {
        if (m.upline_id === memberId && !seenDownlines.has(m.id)) {
          seenDownlines.add(m.id)
          events.push({
            date: month,
            type: 'new_downline',
            title: `Downline ใหม่: ${m.name}`,
            detail: `${m.name} (${m.id}) เข้าร่วมในทีม`,
            icon: '👤',
          })
        }
      }
    }

    // Sort events by date descending (newest first)
    events.sort((a, b) => b.date.localeCompare(a.date))

    return NextResponse.json({
      member: { id: member.id, name: member.name },
      events,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to generate timeline' }, { status: 500 })
  }
}
