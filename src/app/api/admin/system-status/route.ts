import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { loadBusinessReportSyncStatus, loadLatestBusinessReportSnapshot } from '@/lib/business-report-sync'
import { sbSelect } from '@/lib/supabase'
export const dynamic = 'force-dynamic'
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const [status, snapshot, unresolved] = await Promise.all([
      loadBusinessReportSyncStatus(), loadLatestBusinessReportSnapshot(),
      sbSelect<{state:string,updated_at:string}>('telegram_deliveries', 'state=neq.sent&select=state,updated_at'),
    ])
    const consistent = Boolean(status?.ok && status.supabaseSynced && snapshot
      && status.checksum === snapshot.checksum && Date.parse(status.syncedAt) === Date.parse(snapshot.syncedAt))
    const ageMs = status ? Date.now() - Date.parse(status.syncedAt) : NaN
    const fresh = Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 36 * 60 * 60 * 1000
    const delivery = Object.fromEntries(['pending','failed','unknown'].map(state => [state, unresolved.filter(r => r.state === state).length]))
    return NextResponse.json({ ok: consistent && fresh && unresolved.length === 0,
      revision: process.env.APP_BUILD_REVISION ?? 'unknown', report: { consistent, fresh, syncedAt: status?.syncedAt ?? null }, delivery,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false, error: 'Monitoring data unavailable' }, { status: 503 })
  }
}
