import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  ASSESSMENT_QUESTIONS,
  scoreAssessment,
  type StoredPersonalityProfile,
  type Visibility,
} from '@/lib/personality'
import {
  deletePersonalityProfile,
  loadPersonalityProfile,
  savePersonalityProfile,
} from '@/lib/personality-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VISIBILITY_OPTIONS = new Set<Visibility>(['private', 'coach', 'team'])

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const profile = await loadPersonalityProfile(session.memberId)
    return Response.json({ profile }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json() as {
      answers?: Record<string, number>
      consentGiven?: boolean
      visibility?: Visibility
    }

    if (body.consentGiven !== true) {
      return Response.json({ error: 'ต้องให้ความยินยอมก่อนบันทึกผลการประเมิน' }, { status: 400 })
    }

    const visibility = body.visibility ?? 'coach'
    if (!VISIBILITY_OPTIONS.has(visibility)) {
      return Response.json({ error: 'ระดับการมองเห็นไม่ถูกต้อง' }, { status: 400 })
    }

    const answers = body.answers ?? {}
    const missing = ASSESSMENT_QUESTIONS
      .filter(question => !Number.isInteger(answers[question.id]))
      .map(question => question.id)

    if (missing.length > 0) {
      return Response.json({ error: `กรุณาตอบคำถามให้ครบ ${missing.length} ข้อ` }, { status: 400 })
    }

    const result = scoreAssessment(answers)
    const profile: StoredPersonalityProfile = {
      version: 1,
      memberId: session.memberId,
      visibility,
      consentGiven: true,
      assessedAt: new Date().toISOString(),
      ...result,
    }

    await savePersonalityProfile(profile)
    return Response.json({ ok: true, profile }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ error: message }, { status: 400 })
  }
}

export async function DELETE() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await deletePersonalityProfile(session.memberId)
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
