import { NextResponse } from 'next/server'
import { downlineServerIdentity } from '@/lib/jarvis-downline-signing'

export async function GET() {
  return NextResponse.json({ ok: true, ...downlineServerIdentity() }, { headers: { 'cache-control': 'public, max-age=300' } })
}
