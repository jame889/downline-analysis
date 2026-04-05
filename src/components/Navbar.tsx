'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import clsx from 'clsx'

interface Session { memberId: string; name: string; isAdmin: boolean }

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setSession(d.session ?? null))
      .catch(() => {})
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const adminLinks = [
    { href: '/', label: 'Dashboard' },
    { href: '/members', label: 'สมาชิก' },
    { href: '/tree', label: 'โครงสร้าง' },
    { href: '/income-plan', label: '💰 รายได้' },
    { href: '/coach', label: 'Coach JOE' },
    { href: '/leaderboard', label: '🏆' },
    { href: '/simulator', label: '🧮' },
    { href: '/profile', label: '👤' },
    { href: '/telegram', label: '📱' },
    { href: '/admin', label: '⚙️ Admin' },
  ]

  const memberLinks = [
    { href: '/my', label: 'องค์กรของฉัน' },
    { href: `/tree?member=${session?.memberId ?? ''}`, label: 'โครงสร้าง' },
    { href: '/income-plan', label: '💰 รายได้' },
    { href: '/coach', label: 'Coach JOE' },
    { href: '/simulator', label: '🧮' },
    { href: '/profile', label: '👤' },
    { href: '/telegram', label: '📱' },
  ]

  const links = session?.isAdmin ? adminLinks : memberLinks

  return (
    <nav className="bg-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-6 h-14">
        <span className="text-brand-500 font-bold text-lg tracking-tight shrink-0">First Community</span>

        <div className="flex items-center gap-5 flex-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                'text-sm font-medium transition-colors whitespace-nowrap',
                pathname === href || (href !== '/' && pathname.startsWith(href.split('?')[0]))
                  ? 'text-brand-400'
                  : 'text-slate-400 hover:text-slate-100'
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        {session && (
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-slate-300 leading-tight">{session.name}</p>
              <p className="text-xs text-slate-500">{session.memberId}{session.isAdmin ? ' · Admin' : ''}</p>
            </div>
            <button
              onClick={logout}
              className="text-xs text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-700 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              ออกจากระบบ
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
