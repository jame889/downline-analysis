import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? ''
)
const SESSION_COOKIE = 'dl_session'
const ROOT_MEMBER_ID = process.env.NEXT_PUBLIC_ROOT_MEMBER_ID ?? '900057'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const unauthorized = () => pathname.startsWith('/api/')
    ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    : NextResponse.redirect(new URL('/login', request.url))

  // Machine-to-machine routes authenticate with their own bearer secrets.
  const isMachineRoute =
    pathname === '/api/admin/business-report-sync' ||
    pathname === '/api/admin/telegram-broadcast' ||
    pathname === '/api/cron/telegram' ||
    pathname === '/api/telegram/webhook' ||
    pathname.startsWith('/api/jarvis/')

  // Always allow static assets, auth endpoints, chat API, and signed machine routes.
  if (
    pathname.startsWith('/_next') ||
    pathname === '/api/version' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/chat') ||
    isMachineRoute
  ) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (SECRET.length < 32) return NextResponse.json({ error: 'Authentication unavailable' }, { status: 503 })

  // ── Login page ────────────────────────────────────────────────────────────
  if (pathname === '/login') {
    // Already logged in → redirect to appropriate page
    if (token) {
      try {
        const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] })
        const session = payload as { memberId: string; isAdmin: boolean }
        return NextResponse.redirect(
          new URL(session.isAdmin && session.memberId === ROOT_MEMBER_ID ? '/' : '/my', request.url)
        )
      } catch {
        // Invalid token — let them see the login page
      }
    }
    return NextResponse.next()
  }

  // ── Protected pages ───────────────────────────────────────────────────────
  if (!token) {
    return unauthorized()
  }

  try {
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] })
    const session = payload as { memberId: string; isAdmin: boolean }
    if (typeof session.memberId !== 'string' || typeof session.isAdmin !== 'boolean'
      || (session.isAdmin && session.memberId !== ROOT_MEMBER_ID)) return unauthorized()

    // Non-admin on root dashboard → /my
    if (pathname === '/' && !session.isAdmin) {
      return NextResponse.redirect(new URL('/my', request.url))
    }

    return NextResponse.next()
  } catch {
    const res = unauthorized()
    res.cookies.delete(SESSION_COOKIE)
    return res
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
