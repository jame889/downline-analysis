import { NextResponse } from 'next/server'
import { verifyJarvisClientRequest } from '@/lib/jarvis-downline-signing'
import { loadBusinessReportSyncStatus, loadLatestBusinessReportSnapshot } from '@/lib/business-report-sync'


export async function GET(request: Request) {
  if (!(await verifyJarvisClientRequest(request))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const [status, snapshot] = await Promise.all([
    loadBusinessReportSyncStatus(),
    loadLatestBusinessReportSnapshot(),
  ])

  if (!snapshot) {
    return NextResponse.json({ ok: false, error: 'no_snapshot' }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    source: 'downline-analyzer',
    version: 1,
    mode: 'fallback-full-state',
    status,
    snapshot,
  })
}
