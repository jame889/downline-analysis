'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ASSESSMENT_QUESTIONS,
  RESPONSE_OPTIONS,
  getLeadershipSummary,
  type PersonalityAxis,
  type StoredPersonalityProfile,
  type Visibility,
} from '@/lib/personality'

type Answers = Record<string, number>
type Screen = 'intro' | 'assessment' | 'result'

const PAGE_SIZE = 10
const MIXED_QUESTIONS = Array.from({ length: 10 }, (_, index) =>
  (['energy', 'information', 'decision', 'execution', 'pressure'] as PersonalityAxis[])
    .map(axis => ASSESSMENT_QUESTIONS.filter(question => question.axis === axis)[index])
).flat()

const AXIS_META: Record<PersonalityAxis, { title: string; low: string; high: string; description: string }> = {
  energy: { title: 'Social Energy', low: 'Reflective', high: 'Interactive', description: 'วิธีรับพลังและมีส่วนร่วมกับผู้คน' },
  information: { title: 'Information Style', low: 'Practical', high: 'Visionary', description: 'วิธีรับข้อมูลและมองความเป็นไปได้' },
  decision: { title: 'Decision Style', low: 'Relational', high: 'Analytical', description: 'สิ่งที่ให้น้ำหนักเมื่อต้องตัดสินใจ' },
  execution: { title: 'Execution Style', low: 'Adaptive', high: 'Structured', description: 'วิธีวางแผน ลงมือ และปิดงาน' },
  pressure: { title: 'Pressure Response', low: 'Improvement-focused', high: 'Steady', description: 'แนวโน้มในการรับมือแรงกดดันและทบทวนตนเอง' },
}

function AxisBar({ axis, score }: { axis: PersonalityAxis; score: number }) {
  const meta = AXIS_META[axis]
  const balanced = score >= 45 && score <= 55
  return (
    <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-sm font-semibold text-white">{meta.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
        </div>
        <span className="text-sm font-bold text-brand-400">{score}%</span>
      </div>
      <div className="relative h-2 rounded-full bg-slate-700 overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-sky-500 to-purple-500 rounded-full" style={{ width: `${score}%` }} />
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/50" />
      </div>
      <div className="flex justify-between gap-4 mt-2 text-xs">
        <span className={score < 50 ? 'text-sky-300 font-medium' : 'text-slate-500'}>{meta.low}</span>
        {balanced && <span className="text-amber-300">ยืดหยุ่นทั้งสองด้าน</span>}
        <span className={score >= 50 ? 'text-purple-300 font-medium' : 'text-slate-500'}>{meta.high}</span>
      </div>
    </div>
  )
}

function NumberBadge({ children, tone }: { children: React.ReactNode; tone: 'green' | 'amber' }) {
  return (
    <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
      tone === 'green' ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'
    }`}>
      {children}
    </span>
  )
}

function ResultPanel({
  profile,
  onRetake,
  onDelete,
  deleting,
}: {
  profile: StoredPersonalityProfile
  onRetake: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const assessedDate = new Date(profile.assessedAt).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-semibold tracking-[0.2em] text-brand-400 uppercase">First Community Leadership Profile</p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mt-3">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white">{profile.leadershipStyle}</h1>
              <p className="text-slate-300 mt-2 max-w-2xl">{getLeadershipSummary(profile.coreType)}</p>
            </div>
            <div className="md:text-right shrink-0">
              <p className="text-xs text-slate-500">รูปแบบใกล้เคียง</p>
              <p className="text-3xl font-black text-brand-400">{profile.approximateType}</p>
              <p className="text-xs text-slate-500 mt-1">ความชัดของแนวโน้ม {profile.confidence}%</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full bg-slate-800 text-slate-300">ประเมินเมื่อ {assessedDate}</span>
            <span className="px-3 py-1.5 rounded-full bg-slate-800 text-slate-300">
              การมองเห็น: {profile.visibility === 'private' ? 'เฉพาะฉัน' : profile.visibility === 'coach' ? 'ฉันและ Coach JOE' : 'ทีมผู้นำ'}
            </span>
          </div>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        {(Object.keys(AXIS_META) as PersonalityAxis[]).map(axis => (
          <AxisBar key={axis} axis={axis} score={profile.scores[axis]} />
        ))}
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-white">จุดแข็งที่ควรใช้</h2>
          <div className="space-y-3 mt-4">
            {profile.strengths.map((item, index) => (
              <div key={item} className="flex gap-3"><NumberBadge tone="green">{index + 1}</NumberBadge><p className="text-sm text-slate-300 leading-relaxed">{item}</p></div>
            ))}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-white">จุดที่ต้องระวัง</h2>
          <div className="space-y-3 mt-4">
            {profile.risks.map((item, index) => (
              <div key={item} className="flex gap-3"><NumberBadge tone="amber">{index + 1}</NumberBadge><p className="text-sm text-slate-300 leading-relaxed">{item}</p></div>
            ))}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-white">วิธี Coaching ที่เหมาะกับคุณ</h2>
          <div className="space-y-3 mt-4">
            {profile.coachingTips.map(item => <div key={item} className="flex gap-3"><span className="text-brand-400">●</span><p className="text-sm text-slate-300 leading-relaxed">{item}</p></div>)}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-white">กล้ามเนื้อผู้นำที่ควรฝึก</h2>
          <div className="space-y-3 mt-4">
            {profile.growthSkills.map(item => <div key={item} className="flex gap-3"><span className="text-purple-400">◆</span><p className="text-sm text-slate-300 leading-relaxed">{item}</p></div>)}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-br from-brand-500/15 to-purple-500/10 border border-brand-500/30 rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-white">นำผลไปใช้กับ Coach JOE</h2>
        <p className="text-sm text-slate-300 mt-2 leading-relaxed">
          {profile.visibility === 'private'
            ? 'ผลนี้ตั้งค่าเป็นเฉพาะฉัน จึงยังไม่ถูกส่งให้ Coach JOE ใช้ในการแนะนำ หากต้องการเชื่อมกับ Coach JOE ให้ทำแบบประเมินใหม่และเลือก “ฉันและ Coach JOE”'
            : 'Coach JOE จะอ่านผลนี้อัตโนมัติ เพื่อปรับคำแนะนำเรื่อง Start Up, วิธีติดตาม การให้ Feedback และทักษะผู้นำ โดยยังใช้ KPI และพฤติกรรมจริงประกอบเสมอ'}
        </p>
        {profile.visibility !== 'private' && (
          <Link href="/coach" className="inline-flex items-center mt-4 bg-brand-500 hover:bg-brand-400 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors">คุยกับ Coach JOE →</Link>
        )}
      </section>

      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={onRetake} className="flex-1 border border-slate-700 hover:border-brand-500 text-slate-300 hover:text-white px-4 py-3 rounded-xl transition-colors">ทำแบบประเมินใหม่</button>
        <button onClick={onDelete} disabled={deleting} className="sm:w-auto border border-red-900/70 hover:border-red-600 text-red-400 px-4 py-3 rounded-xl transition-colors disabled:opacity-50">{deleting ? 'กำลังลบ...' : 'ลบผลการประเมิน'}</button>
      </div>
      <p className="text-xs text-slate-600 text-center leading-relaxed">ผลนี้เป็นแนวโน้มเพื่อการพัฒนาตนเอง ไม่ใช่แบบประเมิน MBTI® อย่างเป็นทางการ ไม่ใช่การวินิจฉัย และไม่ควรใช้ตัดสินศักยภาพหรือตำแหน่งของบุคคล</p>
    </div>
  )
}

export default function PersonalityAssessmentPage() {
  const [screen, setScreen] = useState<Screen>('intro')
  const [profile, setProfile] = useState<StoredPersonalityProfile | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const [page, setPage] = useState(0)
  const [consentGiven, setConsentGiven] = useState(false)
  const [visibility, setVisibility] = useState<Visibility>('coach')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/personality', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'ไม่สามารถโหลดข้อมูลได้')
        const existing = data.profile as StoredPersonalityProfile | null
        setProfile(existing)
        if (existing) { setVisibility(existing.visibility); setScreen('result') }
      })
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  const pageQuestions = useMemo(() => MIXED_QUESTIONS.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [page])
  const totalPages = Math.ceil(MIXED_QUESTIONS.length / PAGE_SIZE)
  const answeredCount = Object.keys(answers).length
  const currentComplete = pageQuestions.every(question => Number.isInteger(answers[question.id]))
  const isFinalPage = page === totalPages - 1

  function beginAssessment() {
    setAnswers({}); setPage(0); setConsentGiven(false); setError(null); setScreen('assessment')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function nextPage() {
    if (!currentComplete) { setError('กรุณาตอบคำถามในหน้านี้ให้ครบก่อน'); return }
    setError(null)
    if (!isFinalPage) { setPage(value => value + 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  }

  async function submitAssessment() {
    if (!currentComplete || answeredCount !== MIXED_QUESTIONS.length) { setError('กรุณาตอบคำถามให้ครบทุกข้อ'); return }
    if (!consentGiven) { setError('กรุณายืนยันความยินยอมก่อนบันทึกผล'); return }
    setSaving(true); setError(null)
    try {
      const response = await fetch('/api/personality', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, consentGiven, visibility }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'ไม่สามารถบันทึกผลได้')
      setProfile(data.profile); setScreen('result'); window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setSaving(false) }
  }

  async function deleteProfile() {
    if (!window.confirm('ยืนยันลบผลการประเมินและข้อมูล Personality Profile ของคุณ?')) return
    setDeleting(true); setError(null)
    try {
      const response = await fetch('/api/personality', { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'ไม่สามารถลบข้อมูลได้')
      setProfile(null); setAnswers({}); setScreen('intro')
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setDeleting(false) }
  }

  if (loading) return <div className="max-w-3xl mx-auto py-20 text-center"><div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" /><p className="text-slate-400 mt-4">กำลังโหลด Leadership Profile...</p></div>

  if (screen === 'result' && profile) {
    return <div className="max-w-5xl mx-auto">{error && <div className="mb-4 bg-red-950/50 border border-red-900 text-red-300 text-sm rounded-xl px-4 py-3">{error}</div>}<ResultPanel profile={profile} onRetake={beginAssessment} onDelete={deleteProfile} deleting={deleting} /></div>
  }

  if (screen === 'intro') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <section className="relative overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl p-7 md:p-9">
          <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-brand-500/10 blur-3xl" />
          <div className="relative">
            <p className="text-xs font-semibold tracking-[0.2em] text-brand-400 uppercase">First Community Leadership Profile</p>
            <h1 className="text-3xl md:text-4xl font-bold text-white mt-3">เข้าใจธรรมชาติของคุณ<br className="hidden sm:block" /> แล้วพัฒนาให้เป็นผู้นำที่สมบูรณ์ขึ้น</h1>
            <p className="text-slate-300 mt-4 leading-relaxed">แบบประเมินต้นฉบับ 50 ข้อ วิเคราะห์รูปแบบการรับพลัง การรับข้อมูล การตัดสินใจ การลงมือ และการรับแรงกดดัน เพื่อนำไปปรับวิธี Start Up การ Coaching และแผนพัฒนาผู้นำ</p>
            <div className="grid sm:grid-cols-3 gap-3 mt-6">
              {[['50 ข้อ', 'ประมาณ 8–12 นาที'], ['5 แกน', 'แสดงคะแนนต่อเนื่อง'], ['ส่วนตัว', 'เลือกสิทธิ์การมองเห็นได้']].map(([value, label]) => (
                <div key={value} className="bg-slate-800/70 border border-slate-700 rounded-xl p-3"><p className="font-bold text-white">{value}</p><p className="text-xs text-slate-500 mt-1">{label}</p></div>
              ))}
            </div>
            <button onClick={beginAssessment} className="w-full sm:w-auto mt-7 bg-brand-500 hover:bg-brand-400 text-white font-semibold px-6 py-3 rounded-xl transition-colors">เริ่มทำแบบประเมิน</button>
          </div>
        </section>
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="font-semibold text-white">หลักการใช้ผลอย่างรับผิดชอบ</h2>
          <div className="grid sm:grid-cols-2 gap-3 mt-4 text-sm text-slate-400">
            <p>✓ ใช้ปรับวิธีสื่อสาร การเรียนรู้ และการพัฒนาทักษะ</p><p>✓ ใช้ KPI และพฤติกรรมจริงประกอบเสมอ</p><p>✕ ไม่ใช้คัดเลือก ตัดสินตำแหน่ง หรือประเมินคุณค่าคน</p><p>✕ ไม่ใช่การวินิจฉัยทางจิตวิทยา</p>
          </div>
        </section>
        {error && <div className="bg-red-950/50 border border-red-900 text-red-300 text-sm rounded-xl px-4 py-3">{error}</div>}
        <p className="text-xs text-slate-600 text-center leading-relaxed">แบบประเมินนี้พัฒนาโดย First Community และไม่ใช่แบบประเมิน MBTI® หรือ 16Personalities อย่างเป็นทางการ คำถามและการแปลผลถูกสร้างขึ้นใหม่เพื่อการพัฒนาผู้นำ</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-xs text-brand-400 font-semibold">ส่วนที่ {page + 1} จาก {totalPages}</p><h1 className="text-xl font-bold text-white mt-1">ตอบตามตัวตนที่เกิดขึ้นบ่อยที่สุด</h1><p className="text-xs text-slate-500 mt-1">ไม่มีคำตอบถูกหรือผิด และไม่จำเป็นต้องเลือกคำตอบที่ดูเป็นผู้นำที่สุด</p></div>
          <span className="text-sm font-bold text-slate-300">{answeredCount}/{MIXED_QUESTIONS.length}</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full mt-4 overflow-hidden"><div className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all" style={{ width: `${(answeredCount / MIXED_QUESTIONS.length) * 100}%` }} /></div>
      </header>

      {pageQuestions.map((question, questionIndex) => (
        <section key={question.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex gap-3"><span className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 text-xs font-bold flex items-center justify-center shrink-0">{page * PAGE_SIZE + questionIndex + 1}</span><p className="text-white leading-relaxed">{question.text}</p></div>
          <div className="grid grid-cols-5 gap-2 mt-5" role="radiogroup" aria-label={question.text}>
            {RESPONSE_OPTIONS.map(option => {
              const selected = answers[question.id] === option.value
              return <button key={option.value} type="button" role="radio" aria-checked={selected} title={option.label} onClick={() => { setAnswers(current => ({ ...current, [question.id]: option.value })); setError(null) }} className={`min-h-12 rounded-xl border text-sm font-bold transition-all ${selected ? 'bg-brand-500 border-brand-400 text-white scale-[1.02]' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'}`}>{option.value}</button>
            })}
          </div>
          <div className="flex justify-between mt-2 text-[11px] text-slate-600"><span>ไม่ตรงเลย</span><span>ตรงมาก</span></div>
        </section>
      ))}

      {isFinalPage && (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
          <div><label className="text-sm font-semibold text-white">สิทธิ์การมองเห็นผล</label><select value={visibility} onChange={event => setVisibility(event.target.value as Visibility)} className="mt-2 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-brand-500"><option value="private">เฉพาะฉัน</option><option value="coach">ฉันและ Coach JOE</option><option value="team">ทีมผู้นำที่ได้รับสิทธิ์</option></select><p className="text-xs text-slate-500 mt-2">MVP นี้ให้ Coach JOE ใช้ผลของเจ้าของบัญชีเท่านั้น ส่วนการแชร์ให้ทีมจะเปิดใช้เมื่อระบบสิทธิ์พร้อม</p></div>
          <label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" checked={consentGiven} onChange={event => { setConsentGiven(event.target.checked); setError(null) }} className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-800 text-brand-500 focus:ring-brand-500" /><span className="text-sm text-slate-300 leading-relaxed">ฉันยินยอมให้ระบบบันทึกคะแนนและผล Leadership Profile เพื่อใช้ปรับคำแนะนำของ Coach JOE โดยทราบว่าสามารถลบผลได้ทุกเมื่อ และระบบจะไม่บันทึกคำตอบรายข้อหลังคำนวณเสร็จ</span></label>
        </section>
      )}

      {error && <div className="bg-red-950/50 border border-red-900 text-red-300 text-sm rounded-xl px-4 py-3">{error}</div>}
      <div className="flex gap-3 pb-8">
        <button type="button" onClick={() => { if (page === 0) setScreen(profile ? 'result' : 'intro'); else setPage(value => value - 1); setError(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="border border-slate-700 hover:border-slate-500 text-slate-300 px-5 py-3 rounded-xl transition-colors">ย้อนกลับ</button>
        {isFinalPage ? <button type="button" onClick={submitAssessment} disabled={saving} className="flex-1 bg-brand-500 hover:bg-brand-400 text-white font-semibold px-5 py-3 rounded-xl transition-colors disabled:opacity-50">{saving ? 'กำลังวิเคราะห์...' : 'วิเคราะห์และบันทึกผล'}</button> : <button type="button" onClick={nextPage} className="flex-1 bg-brand-500 hover:bg-brand-400 text-white font-semibold px-5 py-3 rounded-xl transition-colors">ถัดไป</button>}
      </div>
    </div>
  )
}
