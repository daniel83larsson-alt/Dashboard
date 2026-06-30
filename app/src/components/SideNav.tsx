'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'

const nav = [
  { href: '/dashboard', label: 'Översikt', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
  )},
  { href: '/dashboard/passlogg', label: 'Passlogg', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )},
  { href: '/dashboard/coach', label: 'Coach', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  )},
  { href: '/dashboard/profil', label: 'Profil & Inställningar', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
    </svg>
  )},
]

export default function SideNav({ userName }: { userName: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    const supabase = createSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-56 bg-card border-r border-edge p-5 z-40">
      <div className="mb-8">
        <div className="font-mono text-accent text-2xl font-bold leading-none">DL</div>
        <div className="text-fg font-semibold text-sm mt-0.5">Trainer</div>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1">
        {nav.map(item => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                active
                  ? 'bg-accent/10 text-accent'
                  : 'text-muted hover:text-fg hover:bg-edge'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-edge pt-4">
        <div className="text-xs text-muted mb-3 truncate">{userName}</div>
        <button
          onClick={signOut}
          className="text-xs text-muted hover:text-fg transition-colors"
        >
          Logga ut
        </button>
      </div>
    </aside>
  )
}
