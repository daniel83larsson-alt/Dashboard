'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'

const ITEMS = [
  { href: '/dashboard', label: 'Översikt', icon: '🏡' },
  { href: '/dashboard/items', label: 'Objekt & logg', icon: '📋' },
  { href: '/dashboard/import', label: 'Importera', icon: '🔗' },
  { href: '/dashboard/radgivare', label: 'Rådgivare', icon: '💬' },
]

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    const supabase = createSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-56 bg-card border-r border-edge p-5 z-40">
        <div className="mb-8 flex items-center gap-2">
          <span className="text-2xl">🏡</span>
          <span className="text-fg font-semibold text-sm">Hemkoll</span>
        </div>
        <nav className="flex flex-col gap-0.5 flex-1">
          {ITEMS.map(item => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                  active ? 'bg-accent/10 text-accent' : 'text-muted hover:text-fg hover:bg-edge'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>
        <button onClick={signOut} className="text-xs text-muted hover:text-fg transition-colors text-left">
          Logga ut
        </button>
      </aside>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-edge flex z-40">
        {ITEMS.map(item => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium ${
                active ? 'text-accent' : 'text-muted'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
