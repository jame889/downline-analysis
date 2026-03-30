import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'downline-sps-secret-key-2026-internal'
)
const SESSION_COOKIE = 'dl_session'
const ROOT_MEMBER_ID = '900057'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow static assets and auth endpoints
  if (pathname.startsWith('/_next') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value

  // ── Login page ────────────────────────────────────────────────────────────
  if (pathname === '/login') {
    // Already logged in → redirect to appropriate page
    if (token) {
      try {
        const { payload } = await jwtVerify(token, SECRET)
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
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const { payload } = await jwtVerify(token, SECRET)
    const session = payload as { memberId: string; isAdmin: boolean }

    // Non-admin on root dashboard → /my
    if (pathname === '/' && !session.isAdmin) {
      return NextResponse.redirect(new URL('/my', request.url))
    }

    // Admin on /my → /
    if (pathname === '/my' && session.isAdmin && session.memberId === ROOT_MEMBER_ID) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    return NextResponse.next()
  } catch {
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete(SESSION_COOKIE)
    return res
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
