import { NextResponse } from 'next/server'
import { verifyJarvisClientRequest } from '@/lib/jarvis-downline-signing'
import { buildJarvisReadModel, JARVIS_READ_SCOPES, recordJarvisReadAudit } from '@/lib/jarvis-read-gateway'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!(await verifyJarvisClientRequest(request))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const model = await buildJarvisReadModel()
  if (!model) {
    return NextResponse.json({ ok: false, error: 'no_snapshot' }, { status: 404 })
  }

  await recordJarvisReadAudit(
    new URL(request.url).pathname,
    JARVIS_READ_SCOPES,
    {
      members: model.members.length,
      activityKpis: model.activityKpis.length,
      learningModules: model.learning.modules.length,
      learningProgress: model.learning.progress.length,
      assessments: model.learning.assessments.length,
      skillScores: model.learning.skillScores.length,
    },
  )

  return NextResponse.json({
    ok: true,
    source: 'downline-analyzer',
    version: 2,
    mode: 'scoped-read-model',
    data: model,
  }, {
    headers: {
      'cache-control': 'no-store, max-age=0',
    },
  })
}
