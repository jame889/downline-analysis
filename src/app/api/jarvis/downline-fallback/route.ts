import { NextResponse } from 'next/server'
import { jarvisDownlineFallbackSecret } from '@/lib/jarvis-downline-auth'
import { loadBusinessReportSyncStatus, loadLatestBusinessReportSnapshot } from '@/lib/business-report-sync'

function authorized(request: Request): boolean {
  const secret = jarvisDownlineFallbackSecret()
  if (!secret) return false
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!authorized(request)) {
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
