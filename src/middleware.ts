import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const SESSION_COOKIE = 'dl_session'

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET?.trim()
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters')
  return new TextEncoder().encode(secret)
}

function getRootMemberId(): string {
  const value = process.env.ROOT_MEMBER_ID?.trim() || process.env.NEXT_PUBLIC_ROOT_MEMBER_ID?.trim()
  if (!value) throw new Error('ROOT_MEMBER_ID must be configured')
  return value
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/_next') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value

  if (pathname === '/login') {
    if (token) {
      try {
        const { payload } = await jwtVerify(token, getSecret())
        const session = payload as { memberId: string; isAdmin: boolean }
        return NextResponse.redirect(
          new URL(session.isAdmin && session.memberId === getRootMemberId() ? '/' : '/my', request.url)
        )
      } catch {
        // Invalid token: show login page.
      }
    }
    return NextResponse.next()
  }

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const { payload } = await jwtVerify(token, getSecret())
    const session = payload as { memberId: string; isAdmin: boolean }

    if (pathname === '/' && !session.isAdmin) {
      return NextResponse.redirect(new URL('/my', request.url))
    }

    if (pathname === '/my' && session.isAdmin && session.memberId === getRootMemberId()) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    return NextResponse.next()
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete(SESSION_COOKIE)
    return res
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
