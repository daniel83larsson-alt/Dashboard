'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'
import { navItems } from '@/lib/nav'
import NavIcon from '@/components/NavIcon'

const PINNED = ['/dashboard', '/dashboard/coach']

export default function BottomNav({ isAdmin, deficitEnabled }: { isAdmin?: boolean; deficitEnabled?: boolean } = {}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const baseItems = navItems({ deficitEnabled })
  const items = isAdmin ? [...baseItems, { href: '/dashboard/admin', label: 'Admin', icon: 'admin' }] : baseItems

  const pinnedItems = baseItems.filter(i => PINNED.includes(i.href))
  const isOnPinned = PINNED.includes(pathname)

  async function signOut() {
    const supabase = createSupabaseClient()
    await supabase.auth.signOut()
    // Hard navigation, not router.push — see login/page.tsx. Same-browser,
    // different-person handoff (phone passed around, shared device) is the
    // exact scenario where a client-cached page/layout can leak across users.
    window.location.href = '/login'
  }

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-edge flex md:hidden z-50 safe-area-pb">
        {pinnedItems.map(item => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors ${
                active ? 'text-accent' : 'text-muted'
              }`}
            >
              <NavIcon icon={item.icon} className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
        <button
          onClick={() => setOpen(true)}
          className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors ${
            !isOnPinned ? 'text-accent' : 'text-muted'
          }`}
        >
          <NavIcon icon="menu" className="w-5 h-5" />
          <span className="text-[10px] font-medium">Meny</span>
        </button>
      </nav>

      {open && (
        <div className="fixed inset-0 z-[60] md:hidden flex flex-col justify-end">
          <div className="flex-1 bg-black/60" onClick={() => setOpen(false)} />
          <div className="bg-card border-t border-edge rounded-t-3xl safe-area-pb">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-edge rounded-full" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-edge">
              <div className="font-semibold text-fg text-sm">Meny</div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 flex items-center justify-center text-muted hover:text-fg">
                <NavIcon icon="close" className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 flex flex-col gap-0.5">
              {items.map(item => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${
                      active ? 'bg-accent/10 text-accent' : 'text-fg hover:bg-edge'
                    }`}
                  >
                    <NavIcon icon={item.icon} className="w-5 h-5" />
                    {item.label}
                  </Link>
                )
              })}
              <button
                onClick={signOut}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-muted hover:bg-edge transition-colors mt-1"
              >
                Logga ut
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
