export type NavItem = { href: string; label: string; icon: string }

const BASE_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Översikt', icon: 'home' },
  { href: '/dashboard/veckoplan', label: 'Veckoplan', icon: 'calendar' },
  { href: '/dashboard/passlogg', label: 'Aktiviteter', icon: 'log' },
  { href: '/dashboard/mat', label: 'Kost', icon: 'food' },
  { href: '/dashboard/rutter', label: 'Rutter', icon: 'route' },
  { href: '/dashboard/halsa', label: 'Hälsa & Insikter', icon: 'heart' },
  { href: '/dashboard/coach', label: 'Coach', icon: 'chat' },
  { href: '/dashboard/profil', label: 'Profil & Inställningar', icon: 'profile' },
]

// Backward-compatible default export for anywhere that doesn't need the
// opt-in Viktmål entry — same list as before this feature existed.
export const NAV_ITEMS = BASE_NAV_ITEMS

// Single source of truth for all dashboard destinations — used by both the
// desktop sidebar and the mobile menu drawer, so adding a new page only
// means adding one entry here. Viktmål only appears for users who've
// opted into deficit tracking (off by default) — same "invisible unless
// opted in" rule every other goal feature in this app follows.
export function navItems({ deficitEnabled }: { deficitEnabled?: boolean } = {}): NavItem[] {
  if (!deficitEnabled) return BASE_NAV_ITEMS
  const items = [...BASE_NAV_ITEMS]
  const kostIdx = items.findIndex(i => i.href === '/dashboard/mat')
  items.splice(kostIdx + 1, 0, { href: '/dashboard/viktmal', label: 'Viktmål', icon: 'target' })
  return items
}
