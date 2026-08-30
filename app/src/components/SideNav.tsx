'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'
import { navItems } from '@/lib/nav'
import NavIcon from '@/components/NavIcon'

export default function SideNav({ userName, isAdmin, deficitEnabled }: { userName: string; isAdmin?: boolean; deficitEnabled?: boolean }) {
  const pathname = usePathname()
  const baseItems = navItems({ deficitEnabled })
  const items = isAdmin ? [...baseItems, { href: '/dashboard/admin', label: 'Admin', icon: 'admin' }] : baseItems

  async function signOut() {
    const supabase = createSupabaseClient()
    await supabase.auth.signOut()
    // Hard navigation — see login/page.tsx for why: this layout (including
    // userName above) is cached client-side across route changes, and
    // Supabase's cookie write isn't visible to that cache. A soft push can
    // leave the NEXT person on this browser looking at this user's shell.
    window.location.href = '/login'
  }

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-56 bg-card border-r border-edge p-5 z-40">
      <div className="mb-8">
        <div className="font-mono text-accent text-2xl font-bold leading-none">DL</div>
        <div className="text-fg font-semibold text-sm mt-0.5">Trainer</div>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1">
        {items.map(item => {
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
              <NavIcon icon={item.icon} />
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
