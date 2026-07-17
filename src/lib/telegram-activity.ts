import { randomUUID } from 'crypto'
import {
  ACTIVITY_TYPE_LABELS,
  type ActivityOutcome,
  type ActivityType,
  type DailyActivity,
} from './daily-activities'

const TYPE_PATTERNS: Array<[ActivityType, RegExp]> = [
  ['post_social', /post\s*social|โพสต์\s*(?:social|โซเชียล)/i],
  ['appointment_call', /โทร\s*นัด|นัดหมาย/i],
  ['promotion_call', /โทร\s*โปรโมท|โปรโมทงาน/i],
  ['house_meeting', /house\s*meeting|เฮ้าส์\s*มีตติ้ง/i],
  ['start_up', /start\s*up|สตาร์ต\s*อัพ|สตาร์ท\s*อัพ/i],
  ['zoom_line_meeting', /zoom|line\s*meeting|ไลน์\s*มีตติ้ง/i],
  ['unlock_meeting', /unlock\s*meeting|อันล็อก\s*มีตติ้ง/i],
  ['big_house', /big\s*house|บิ๊ก\s*เฮ้าส์/i],
  ['one_day_take_off', /one\s*day\s*take\s*off/i],
  ['the_first_class', /the\s*first\s*class|first\s*class/i],
  ['star_forum', /star\s*forum|สตาร์\s*ฟอรั่ม/i],
  ['camp', /\bcamp\b|แคมป์/i],
]

function bangkokDate(offset = 0): string {
  const current = new Date(Date.now() + offset * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(current)
}

function dateFromText(text: string): string {
  const explicit = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/)
  if (explicit) return explicit[0]
  if (/พรุ่งนี้/.test(text)) return bangkokDate(1)
  return bangkokDate()
}

function countFromText(text: string, side: 'ซ้าย' | 'ขวา'): number {
  const match = text.match(new RegExp(`(?:ทีม)?${side}\\s*(?:เข้า|มา|ได้)?\\s*(\\d{1,4})`, 'i'))
  return match ? Math.min(9999, Number(match[1])) : 0
}

function outcomeFromText(text: string): ActivityOutcome {
  if (/start\s*up\s*(?:สำเร็จ|แล้ว)|สตาร์[ตท]\s*อัพ\s*(?:สำเร็จ|แล้ว)/i.test(text)) return 'startup_completed'
  if (/สมัคร(?:สมาชิก)?|sponsor/i.test(text)) return 'sponsored'
  if (/รอ\s*follow|ติดตามผล|follow\s*up/i.test(text)) return 'follow_up'
  if (/เข้าร่วม|มา\s*meeting|มา\s*มีตติ้ง/i.test(text)) return 'attended'
  if (/ได้นัด|นัดได้|นัดหมายสำเร็จ/i.test(text)) return 'appointment_booked'
  if (/ติดต่อได้|รับสาย/i.test(text)) return 'contacted'
  return 'none'
}

export function activityHelp(): string {
  return [
    'บันทึกกิจกรรมได้แบบนี้:',
    'บันทึก วันนี้ 19:00 โทรนัดหมาย 5 คน ได้นัด 2 คน ทีมซ้าย 1 ทีมขวา 1',
    'บันทึก พรุ่งนี้ 20:00 Zoom Meeting ทีมซ้าย 3 ทีมขวา 2',
    '',
    'ประเภทที่รองรับ: Post Social, โทรนัดหมาย, โทรโปรโมทงาน, House Meeting, Start Up, Zoom/Line Meeting, Unlock Meeting, Big House, One Day Take Off, The First Class, Star Forum และ Camp',
  ].join('\n')
}

export function parseTelegramActivity(memberId: string, rawText: string): DailyActivity | null {
  const text = rawText.replace(/^\/activity(?:@\w+)?\s*/i, '').replace(/^บันทึก(?:กิจกรรม)?\s*/i, '').trim()
  const type = TYPE_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0]
  const time = text.match(/(?:เวลา\s*)?([01]?\d|2[0-3])[:.](\d{2})/)
  const explicitSave = /^\/activity|^บันทึก/.test(rawText.trim())
  const naturalEntry = /วันนี้|พรุ่งนี้|\b20\d{2}-\d{2}-\d{2}\b/.test(text) && Boolean(time)
  if (!type || (!explicitSave && !naturalEntry)) return null

  const now = new Date().toISOString()
  const date = dateFromText(text)
  const startTime = time ? `${time[1].padStart(2, '0')}:${time[2]}` : new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
  const outcome = outcomeFromText(text)

  return {
    id: randomUUID(),
    memberId,
    date,
    startTime,
    endTime: '',
    type,
    details: text.slice(0, 1000),
    leftCount: countFromText(text, 'ซ้าย'),
    rightCount: countFromText(text, 'ขวา'),
    status: date <= bangkokDate() ? 'completed' : 'planned',
    outcome,
    contactName: '',
    outcomeNotes: outcome === 'none' ? '' : text.slice(0, 1000),
    followUpDate: '',
    createdAt: now,
    updatedAt: now,
  }
}

export function formatActivityConfirmation(activity: DailyActivity): string {
  return [
    'บันทึกกิจกรรมเรียบร้อย',
    `${activity.date} เวลา ${activity.startTime}`,
    `${ACTIVITY_TYPE_LABELS[activity.type]}`,
    `ทีมซ้าย ${activity.leftCount} คน · ทีมขวา ${activity.rightCount} คน`,
    `สถานะ ${activity.status === 'planned' ? 'วางแผน' : 'ทำแล้ว'}`,
    '',
    'พิมพ์ /undo เพื่อยกเลิกรายการล่าสุด',
  ].join('\n')
}
