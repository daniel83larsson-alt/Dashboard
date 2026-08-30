import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import BottomNav from '@/components/BottomNav'
import SideNav from '@/components/SideNav'
import { isDemoAccount } from '@/lib/demo'

// Same spinner as dashboard/loading.tsx on purpose — this boundary and that
// one now render back-to-back with nothing in between, so they need to look
// like one continuous spinner rather than two different ones flashing past.
function DashboardBootSplash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="font-mono text-accent text-4xl font-bold tracking-tight leading-none animate-pulse">DL</div>
      <span className="w-4 h-4 border-2 border-edge border-t-accent rounded-full animate-spin" />
    </div>
  )
}

// The auth check + profile-name fetch used to sit directly in the layout
// body, which blocks ALL rendering (nav chrome included) until it resolves
// — loading.tsx's Suspense boundary only wraps page.tsx, not layout.tsx, so
// this was the actual source of the reported cold-start black screen (a
// network round trip with literally nothing on screen), not page.tsx's own
// heavier data fetch. Moving it into its own async component under an
// explicit <Suspense> here lets the boot splash stream immediately instead.
async function AuthedShell({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, deficit_tracking_enabled')
    .eq('id', user.id)
    .single()

  const userName = profile?.name ?? user.email?.split('@')[0] ?? 'Tränare'
  const isAdmin = !!process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL
  const isDemo = isDemoAccount(user.email)
  const deficitEnabled = !!profile?.deficit_tracking_enabled

  return (
    <div className="min-h-screen bg-bg flex">
      <SideNav userName={userName} isAdmin={isAdmin} deficitEnabled={deficitEnabled} />
      <main className="flex-1 min-w-0 flex flex-col pb-20 md:pb-0 md:ml-56 min-h-screen">
        {isDemo && (
          <div className="bg-accent text-bg text-xs font-semibold px-4 py-2 flex items-center justify-center gap-2 flex-wrap text-center">
            <span>🔍 DEMO-DATA — det här är inte riktig data</span>
            <a href="/login" className="underline">Skapa eget konto →</a>
          </div>
        )}
        {children}
      </main>
      <BottomNav isAdmin={isAdmin} deficitEnabled={deficitEnabled} />
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<DashboardBootSplash />}>
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  )
}
