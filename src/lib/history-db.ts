import fs from 'fs'
import path from 'path'
import { gunzipSync } from 'zlib'
import type { Member, MonthlyReport } from './types'

interface CompactHistory {
  version: number
  fields: string[]
  months: string[]
  members: Record<string, Member>
  reports: Record<string, unknown[][]>
}

const HISTORY_FILE = path.join(process.cwd(), 'data', 'history-9m.json.gz.b64')
const HISTORY_PARTS_DIR = path.join(process.cwd(), 'data', 'history')
let cache: CompactHistory | null | undefined

function readEncodedHistory(): string | null {
  if (fs.existsSync(HISTORY_FILE)) {
    return fs.readFileSync(HISTORY_FILE, 'utf-8').trim()
  }
  if (!fs.existsSync(HISTORY_PARTS_DIR)) return null
  const parts = fs.readdirSync(HISTORY_PARTS_DIR)
    .filter((name) => name.startsWith('history-9m.part-'))
    .sort()
  if (parts.length === 0) return null
  return parts
    .map((name) => fs.readFileSync(path.join(HISTORY_PARTS_DIR, name), 'utf-8'))
    .join('')
    .trim()
}

function loadHistory(): CompactHistory | null {
  if (cache !== undefined) return cache
  try {
    const encoded = readEncodedHistory()
    if (!encoded) {
      cache = null
      return cache
    }
    const json = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf-8')
    cache = JSON.parse(json) as CompactHistory
    return cache
  } catch (error) {
    console.error('[history-db] failed to load bundled history', error)
    cache = null
    return cache
  }
}

function rowToReport(month: string, fields: string[], values: unknown[]): MonthlyReport {
  const row: Record<string, unknown> = { month }
  fields.forEach((field, index) => {
    row[field] = values[index]
  })
  return row as unknown as MonthlyReport
}

export function getBundledHistoryMonths(): string[] {
  return loadHistory()?.months ?? []
}

export function getBundledHistoryMembers(): Record<string, Member> {
  return loadHistory()?.members ?? {}
}

export function getBundledHistoryReport(month: string): MonthlyReport[] {
  const history = loadHistory()
  if (!history) return []
  const rows = history.reports[month] ?? []
  return rows.map((values) => rowToReport(month, history.fields, values))
}

export function hasBundledHistory(): boolean {
  return loadHistory() !== null
}
