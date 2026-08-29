import crypto from 'crypto'

const INGEST_CONTEXT = 'jarvis-downline-ingest-v1'
const FALLBACK_CONTEXT = 'jarvis-downline-fallback-v1'

function derive(context: string): string {
  const root = process.env.JWT_SECRET?.trim()
  if (!root) return ''
  return crypto.createHmac('sha256', root).update(context).digest('hex')
}

export function jarvisDownlineIngestSecret(): string {
  return process.env.JARVIS_DOWNLINE_INGEST_SECRET?.trim() || derive(INGEST_CONTEXT)
}

export function jarvisDownlineFallbackSecret(): string {
  return process.env.JARVIS_DOWNLINE_FALLBACK_SECRET?.trim() || derive(FALLBACK_CONTEXT)
}

export function jarvisDownlineIngestUrl(): string {
  return process.env.JARVIS_DOWNLINE_INGEST_URL?.trim() ||
    'https://mac-mini.tailac7560.ts.net/jarvis-downline/api/jarvis/downline/events'
}
