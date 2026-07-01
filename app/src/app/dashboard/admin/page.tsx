import { createSupabaseServerClient } from '@/lib/supabase-server'
import AdminUserRow from '@/components/AdminUserRow'

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const isAdmin = process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL
  if (!isAdmin) {
    return (
      <div className="p-4 md:p-8 max-w-lg w-full">
        <div className="bg-card border border-edge rounded-2xl p-10 text-center">
          <div className="font-medium">Ingen åtkomst</div>
        </div>
      </div>
    )
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, name, created_at, locked, flagged_attempts')
    .order('created_at', { ascending: false })

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-muted text-sm mt-1">{profiles?.length ?? 0} registrerade användare</p>
      </div>

      <div className="flex flex-col gap-2">
        {(profiles ?? []).map(p => (
          <AdminUserRow key={p.id} profile={p} isSelf={p.id === user.id} />
        ))}
      </div>
    </div>
  )
}
