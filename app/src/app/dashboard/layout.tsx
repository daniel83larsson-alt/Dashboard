import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import BottomNav from '@/components/BottomNav'
import SideNav from '@/components/SideNav'
import { isDemoAccount } from '@/lib/demo'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  const userName = profile?.name ?? user.email?.split('@')[0] ?? 'Tränare'
  const isAdmin = !!process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL
  const isDemo = isDemoAccount(user.email)

  return (
    <div className="min-h-screen bg-bg flex">
      <SideNav userName={userName} isAdmin={isAdmin} />
      <main className="flex-1 min-w-0 flex flex-col pb-20 md:pb-0 md:ml-56 min-h-screen">
        {isDemo && (
          <div className="bg-accent text-bg text-xs font-semibold px-4 py-2 flex items-center justify-center gap-2 flex-wrap text-center">
            <span>🔍 DEMO-DATA — det här är inte riktig data</span>
            <a href="/login" className="underline">Skapa eget konto →</a>
          </div>
        )}
        {children}
      </main>
      <BottomNav isAdmin={isAdmin} />
    </div>
  )
}
