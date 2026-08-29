import { NextResponse } from 'next/server'
import { verifyJarvisClientRequest } from '@/lib/jarvis-downline-signing'
import { loadBusinessReportSyncStatus } from '@/lib/business-report-sync'


export async function GET(request: Request) {
  if (!(await verifyJarvisClientRequest(request))) {
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
