'use client'
import { useEffect, useState } from 'react'

interface TelegramConfig {
  chatId: string
  enabled: boolean
  createdAt: string
}

interface NotifType {
  key: 'weekly' | 'watchlist' | 'leaderboard' | 'wakeup'
  icon: string
  label: string
}

const NOTIF_TYPES: NotifType[] = [
  { key: 'weekly', icon: '📊', label: 'สรุปรายสัปดาห์' },
  { key: 'watchlist', icon: '⚠️', label: 'แจ้งเตือนสมาชิกเสี่ยงหลุด' },
  { key: 'leaderboard', icon: '🏆', label: 'Leaderboard รายเดือน' },
  { key: 'wakeup', icon: '📣', label: 'ปลุกคนหลับ' },
]

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-brand-500' : 'bg-slate-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function EyeIcon({ show }: { show: boolean }) {
  if (show) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
      </svg>
    )
  }
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
}

export default function TelegramPage() {
  const [config, setConfig] = useState<TelegramConfig | null>(null)
  const [configured, setConfigured] = useState(false)
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [accordionOpen, setAccordionOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [notifToggles, setNotifToggles] = useState<Record<string, boolean>>({
    weekly: true,
    watchlist: true,
    leaderboard: true,
    wakeup: false,
  })
  const [sendingType, setSendingType] = useState<string | null>(null)
  const [sendMsgs, setSendMsgs] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({})

  useEffect(() => {
    fetch('/api/telegram')
      .then((r) => r.json())
      .then((d) => {
        setConfigured(d.configured)
        if (d.config) {
          setConfig(d.config)
          setChatId(d.config.chatId ?? '')
        }
      })
      .catch(() => {})
  }, [])

  async function handleSave() {
    if (!chatId.trim()) {
      setSaveMsg({ type: 'error', text: 'กรุณากรอก Chat ID' })
      return
    }
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: chatId.trim(), botToken: botToken.trim() || undefined }),
      })
      const d = await res.json()
      if (d.success) {
        setSaveMsg({ type: 'success', text: 'บันทึกการตั้งค่าเรียบร้อยแล้ว' })
        setConfigured(true)
        setConfig({ chatId: chatId.trim(), enabled: true, createdAt: config?.createdAt ?? new Date().toISOString() })
      } else {
        setSaveMsg({ type: 'error', text: d.error ?? 'เกิดข้อผิดพลาด' })
      }
    } catch {
      setSaveMsg({ type: 'error', text: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' })
    } finally {
      setSaving(false)
    }
  }

  async function handleSend(type: string) {
    setSendingType(type)
    setSendMsgs((prev) => ({ ...prev, [type]: { type: 'success', text: 'กำลังส่ง...' } }))
    try {
      const res = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const d = await res.json()
      if (res.ok && !d.error) {
        setSendMsgs((prev) => ({ ...prev, [type]: { type: 'success', text: 'ส่งสำเร็จ!' } }))
      } else {
        setSendMsgs((prev) => ({ ...prev, [type]: { type: 'error', text: d.error ?? 'ส่งไม่สำเร็จ' } }))
      }
    } catch {
      setSendMsgs((prev) => ({ ...prev, [type]: { type: 'error', text: 'เกิดข้อผิดพลาด' } }))
    } finally {
      setSendingType(null)
      setTimeout(() => {
        setSendMsgs((prev) => {
          const next = { ...prev }
          delete next[type]
          return next
        })
      }, 4000)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">📱</span>
        <div>
          <h1 className="text-2xl font-bold text-white">Telegram แจ้งเตือน</h1>
          <p className="text-slate-400 text-sm">ตั้งค่าการรับการแจ้งเตือนผ่าน Telegram Bot</p>
        </div>
      </div>

      {/* Status indicator */}
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium ${
        configured
          ? 'bg-green-900/20 border-green-800 text-green-400'
          : 'bg-red-900/20 border-red-800 text-red-400'
      }`}>
        <span className="text-base">{configured ? '✓' : '✗'}</span>
        <span>{configured ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้ตั้งค่า'}</span>
        {configured && config?.createdAt && (
          <span className="ml-auto text-xs text-slate-500">
            ตั้งค่าเมื่อ {new Date(config.createdAt).toLocaleDateString('th-TH')}
          </span>
        )}
      </div>

      {/* Setup Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <span>⚙️</span> ตั้งค่า Bot
        </h2>

        {/* Bot Token */}
        <div className="space-y-1.5">
          <label className="text-sm text-slate-400">Bot Token</label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="1234567890:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 pr-10 focus:outline-none focus:border-brand-500 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <EyeIcon show={showToken} />
            </button>
          </div>
        </div>

        {/* Chat ID */}
        <div className="space-y-1.5">
          <label className="text-sm text-slate-400">Chat ID</label>
          <input
            type="text"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="-1001234567890"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>

        {/* Accordion: steps */}
        <div className="border border-slate-700 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setAccordionOpen(!accordionOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <span className="font-medium">ขั้นตอนการตั้งค่า</span>
            <span className="text-slate-500">{accordionOpen ? '▲' : '▼'}</span>
          </button>
          {accordionOpen && (
            <div className="px-4 pb-4 space-y-3 text-sm text-slate-400 bg-slate-800/50">
              <div className="pt-3 space-y-2.5">
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-900 border border-brand-700 text-brand-400 text-xs font-bold flex items-center justify-center">1</span>
                  <p>ไปที่ <span className="text-brand-400 font-mono">@BotFather</span> บน Telegram → พิมพ์ <span className="font-mono text-white">/newbot</span> → ตั้งชื่อบอท → copy <span className="text-yellow-400">Token</span></p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-900 border border-brand-700 text-brand-400 text-xs font-bold flex items-center justify-center">2</span>
                  <p>พิมพ์ <span className="font-mono text-white">/start</span> ในบอทของคุณ → เปิด URL <span className="text-blue-400 font-mono text-xs break-all">https://api.telegram.org/bot{'{TOKEN}'}/getUpdates</span> → ดูค่า <span className="text-yellow-400">chat_id</span> ใน result</p>
                </div>
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-900 border border-brand-700 text-brand-400 text-xs font-bold flex items-center justify-center">3</span>
                  <p>กรอก Token และ Chat ID ด้านบน แล้วกด <span className="text-white font-medium">บันทึก</span></p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Save message */}
        {saveMsg && (
          <div className={`text-sm px-3 py-2 rounded-lg ${
            saveMsg.type === 'success'
              ? 'bg-green-900/30 border border-green-800 text-green-400'
              : 'bg-red-900/30 border border-red-800 text-red-400'
          }`}>
            {saveMsg.text}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
          </button>
          <button
            onClick={() => handleSend('weekly')}
            disabled={sendingType === 'weekly' || !configured}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 font-medium rounded-xl transition-colors text-sm border border-slate-700"
          >
            ทดสอบส่ง
          </button>
        </div>
      </div>

      {/* Notification Settings Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <span>🔔</span> การแจ้งเตือน
        </h2>
        <div className="space-y-3">
          {NOTIF_TYPES.map((nt) => (
            <div key={nt.key} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-xl">{nt.icon}</span>
                <div>
                  <p className="text-sm text-white font-medium">{nt.label}</p>
                  <p className="text-xs text-slate-500">type: {nt.key}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {notifToggles[nt.key] && (
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={() => handleSend(nt.key)}
                      disabled={sendingType === nt.key || !configured}
                      className="text-xs px-2.5 py-1 bg-brand-900/40 hover:bg-brand-900/60 disabled:opacity-40 text-brand-400 border border-brand-800 rounded-lg transition-colors"
                    >
                      {sendingType === nt.key ? 'ส่ง...' : 'ส่งทดสอบ'}
                    </button>
                    {sendMsgs[nt.key] && (
                      <span className={`text-xs ${sendMsgs[nt.key].type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                        {sendMsgs[nt.key].text}
                      </span>
                    )}
                  </div>
                )}
                <Toggle
                  checked={notifToggles[nt.key]}
                  onChange={(v) => setNotifToggles((prev) => ({ ...prev, [nt.key]: v }))}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* History / Status Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <span>📋</span> สถานะการส่ง
        </h2>
        {configured && config ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span>Chat ID</span>
              <span className="font-mono text-slate-300">{config.chatId}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>ตั้งค่าเมื่อ</span>
              <span className="text-slate-300">
                {new Date(config.createdAt).toLocaleString('th-TH', {
                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>สถานะ</span>
              <span className="text-green-400 font-medium">✓ เชื่อมต่อแล้ว</span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500 flex items-center gap-2">
            <span className="text-red-400">✗</span>
            <span>ยังไม่ได้ตั้งค่า — กรอกข้อมูลด้านบนแล้วบันทึก</span>
          </div>
        )}
      </div>
    </div>
  )
}
