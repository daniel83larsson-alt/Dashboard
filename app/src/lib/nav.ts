export type NavItem = { href: string; label: string; icon: string }

// Single source of truth for all dashboard destinations — used by both the
// desktop sidebar and the mobile menu drawer, so adding a new page only
// means adding one entry here.
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Översikt', icon: 'home' },
  { href: '/dashboard/veckoplan', label: 'Veckoplan', icon: 'calendar' },
  { href: '/dashboard/passlogg', label: 'Aktiviteter', icon: 'log' },
  { href: '/dashboard/mat', label: 'Mat', icon: 'food' },
  { href: '/dashboard/rutter', label: 'Rutter', icon: 'route' },
  { href: '/dashboard/halsa', label: 'Hälsa & Insikter', icon: 'heart' },
  { href: '/dashboard/coach', label: 'Coach', icon: 'chat' },
  { href: '/dashboard/profil', label: 'Profil & Inställningar', icon: 'profile' },
]
