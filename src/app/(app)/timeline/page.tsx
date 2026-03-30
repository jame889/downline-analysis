'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface TimelineEvent {
  date: string
  type: 'join' | 'position_up' | 'became_active' | 'became_inactive' | string
  title: string
  detail: string
}

interface TimelineData {
  member: { id: string; name: string; join_date: string }
  events: TimelineEvent[]
}

function eventStyle(type: string) {
  switch (type) {
    case 'join':
      return { bg: 'bg-blue-500', border: 'border-blue-500/50', text: 'text-blue-400', icon: '+' }
    case 'position_up':
      return { bg: 'bg-amber-500', border: 'border-amber-500/50', text: 'text-amber-400', icon: '\u2191' }
    case 'became_active':
      return { bg: 'bg-green-500', border: 'border-green-500/50', text: 'text-green-400', icon: '\u25CF' }
    case 'became_inactive':
      return { bg: 'bg-red-500', border: 'border-red-500/50', text: 'text-red-400', icon: '\u25CB' }
    default:
      return { bg: 'bg-slate-500', border: 'border-slate-500/50', text: 'text-slate-400', icon: '\u2022' }
  }
}

function TimelineContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialId = searchParams.get('id') ?? ''

  const [memberId, setMemberId] = useState(initialId)
  const [searchInput, setSearchInput] = useState(initialId)
  const [data, setData] = useState<TimelineData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function fetchTimeline(id: string) {
    if (!id.trim()) return
    setLoading(true)
    setError(null)
    fetch(`/api/timeline?id=${encodeURIComponent(id.trim())}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error)
          setData(null)
        } else {
          setData(d)
          setError(null)
        }
        setLoading(false)
      })
      .catch(() => { setError('ไม่สามารถโหลดข้อมูลได้'); setLoading(false) })
  }

  useEffect(() => {
    if (initialId) fetchTimeline(initialId)
  }, [initialId])

  function handleSearch() {
    if (searchInput.trim()) {
      setMemberId(searchInput.trim())
      router.replace(`/timeline?id=${encodeURIComponent(searchInput.trim())}`)
      fetchTimeline(searchInput.trim())
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Timeline สมาชิก</h1>
        <p className="text-slate-400 text-sm mt-1">ดูประวัติการเปลี่ยนแปลงของสมาชิก</p>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="ใส่รหัสสมาชิก..."
          className="flex-1 max-w-sm bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
        />
        <button
          onClick={handleSearch}
          className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-5 py-2 rounded-lg transition-colors font-medium"
        >
          ค้นหา
        </button>
      </div>

      {loading && <div className="text-slate-400 py-16 text-center">กำลังโหลด...</div>}
      {error && <div className="text-red-400 py-8 text-center">{error}</div>}

      {!loading && data && (
        <>
          {/* Member info */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-3">
              <span className="text-brand-400 font-mono">{data.member.id}</span>
              <span className="text-white font-semibold">{data.member.name}</span>
              <span className="text-slate-500 text-sm">สมัคร {data.member.join_date}</span>
            </div>
          </div>

          {/* Timeline */}
          {data.events.length === 0 ? (
            <div className="text-center py-12 text-slate-500">ไม่พบเหตุการณ์</div>
          ) : (
            <div className="relative pl-8">
              {/* Vertical line */}
              <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-slate-800" />

              <div className="space-y-4">
                {data.events.map((event, i) => {
                  const style = eventStyle(event.type)
                  return (
                    <div key={i} className="relative">
                      {/* Dot */}
                      <div className={`absolute -left-5 top-2 w-5 h-5 rounded-full ${style.bg} flex items-center justify-center`}>
                        <span className="text-white text-xs font-bold">{style.icon}</span>
                      </div>

                      {/* Card */}
                      <div className={`bg-slate-900 border ${style.border} rounded-xl p-4 ml-4`}>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xs text-slate-500 font-mono">{event.date}</span>
                          <span className={`text-xs font-medium ${style.text}`}>{event.title}</span>
                        </div>
                        <p className="text-sm text-slate-300">{event.detail}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !data && !error && (
        <div className="text-center py-16 text-slate-500">
          ใส่รหัสสมาชิกเพื่อดู Timeline
        </div>
      )}
    </div>
  )
}

export default function TimelinePage() {
  return (
    <Suspense fallback={<div className="text-slate-400 py-16 text-center">กำลังโหลด...</div>}>
      <TimelineContent />
    </Suspense>
  )
}
