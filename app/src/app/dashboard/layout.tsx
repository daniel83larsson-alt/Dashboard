import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import BottomNav from '@/components/BottomNav'
import SideNav from '@/components/SideNav'

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

  return (
    <div className="min-h-screen bg-bg flex">
      <SideNav userName={userName} isAdmin={isAdmin} />
      <main className="flex-1 flex flex-col pb-20 md:pb-0 md:ml-56 min-h-screen">
        {children}
      </main>
      <BottomNav isAdmin={isAdmin} />
    </div>
  )
}
