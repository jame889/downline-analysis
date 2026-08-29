import { NextResponse } from 'next/server'
import { loadBusinessReportSyncStatus } from '@/lib/business-report-sync'

function authorized(request: Request): boolean {
  const secret = process.env.JARVIS_DOWNLINE_FALLBACK_SECRET || process.env.JARVIS_DOWNLINE_INGEST_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const status = await loadBusinessReportSyncStatus()
  if (!status) {
    return NextResponse.json({ ok: false, error: 'no_sync_status' }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    source: 'downline-analyzer',
    version: 1,
    month: status.month,
    checksum: status.checksum,
    syncedAt: status.syncedAt,
    members: status.members,
    rows: status.rows,
  })
}
