import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export async function GET() {
  return NextResponse.json({ revision: process.env.APP_BUILD_REVISION ?? 'unknown' }, { headers: { 'Cache-Control': 'no-store' } })
}
