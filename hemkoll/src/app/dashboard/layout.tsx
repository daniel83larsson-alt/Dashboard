import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import Nav from '@/components/Nav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-bg flex">
      <Nav />
      <main className="flex-1 flex flex-col pb-20 md:pb-0 md:ml-56 min-h-screen">
        {children}
      </main>
    </div>
  )
}
