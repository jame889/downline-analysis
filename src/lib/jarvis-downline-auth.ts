export function jarvisDownlineIngestUrl(): string {
  return process.env.JARVIS_DOWNLINE_INGEST_URL?.trim()
    || 'https://mac-mini.tailac7560.ts.net/jarvis-downline/api/jarvis/downline/events'
}
