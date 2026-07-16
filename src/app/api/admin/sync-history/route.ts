import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  getBundledHistoryMembers,
  getBundledHistoryMonths,
  getBundledHistoryReport,
  hasBundledHistory,
} from '@/lib/history-db'
import { upsertMembers, upsertMonthlyReports } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  if (!hasBundledHistory()) return NextResponse.json({ error: 'Bundled history not found' }, { status: 404 })

  try {
    const members = getBundledHistoryMembers()
    const months = getBundledHistoryMonths()
    await upsertMembers(members)

    const counts: Record<string, number> = {}
    for (const month of months) {
      const reports = getBundledHistoryReport(month)
      await upsertMonthlyReports(month, reports)
      counts[month] = reports.length
    }

    return NextResponse.json({
      ok: true,
      members: Object.keys(members).length,
      months,
      counts,
      storage: process.env.SUPABASE_URL ? 'Supabase' : 'local JSON',
    })
  } catch (error) {
    console.error('[sync-history]', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
