export type NavItem = { href: string; label: string; icon: string }

// Single source of truth for all dashboard destinations — used by both the
// desktop sidebar and the mobile menu drawer, so adding a new page only
// means adding one entry here.
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Översikt', icon: 'home' },
  { href: '/dashboard/passlogg', label: 'Passlogg', icon: 'log' },
  { href: '/dashboard/rorlighet', label: 'Rörlighet', icon: 'stretch' },
  { href: '/dashboard/rekord', label: 'Rekord', icon: 'trophy' },
  { href: '/dashboard/insikter', label: 'Insikter', icon: 'insight' },
  { href: '/dashboard/halsa', label: 'Hälsa', icon: 'heart' },
  { href: '/dashboard/grafer', label: 'Grafer', icon: 'chart' },
  { href: '/dashboard/coach', label: 'Coach', icon: 'chat' },
  { href: '/dashboard/profil', label: 'Profil & Inställningar', icon: 'profile' },
]
