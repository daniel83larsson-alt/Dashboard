import { createSupabaseServerClient } from '@/lib/supabase-server'
import AdminUserRow from '@/components/AdminUserRow'

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const isAdmin = process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL
  if (!isAdmin) {
    return (
      <div className="p-4 md:p-8 max-w-lg w-full mx-auto">
        <div className="bg-card border border-edge rounded-2xl p-10 text-center">
          <div className="font-medium">Ingen åtkomst</div>
        </div>
      </div>
    )
  }

  const [{ data: profiles }, { data: syncStatus }, { data: activityStats }] = await Promise.all([
    supabase.rpc('admin_list_profiles'),
    supabase.rpc('admin_all_sync_status'),
    supabase.rpc('admin_activity_stats'),
  ])

  type SyncRow = { user_id: string; has_concept2: boolean; has_garmin: boolean }
  type ActivityStatsRow = { user_id: string; activity_count: number; days_synced: number; last_synced: string }
  type ProfileRow = { id: string; email: string; name: string | null; created_at: string; locked: boolean | null; flagged_attempts: number | null }
  const syncByUser = new Map<string, SyncRow>((syncStatus ?? []).map((s: SyncRow) => [s.user_id, s]))
  const statsByUser = new Map<string, ActivityStatsRow>((activityStats ?? []).map((s: ActivityStatsRow) => [s.user_id, s]))
  const profileRows = (profiles ?? []) as ProfileRow[]

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-muted text-sm mt-1">{profileRows.length} registrerade användare</p>
      </div>

      <div className="flex flex-col gap-2">
        {profileRows.map(p => (
          <AdminUserRow
            key={p.id}
            profile={p}
            isSelf={p.id === user.id}
            hasConcept2={!!syncByUser.get(p.id)?.has_concept2}
            hasGarmin={!!syncByUser.get(p.id)?.has_garmin}
            activityCount={statsByUser.get(p.id)?.activity_count ?? 0}
            daysSynced={statsByUser.get(p.id)?.days_synced ?? 0}
            lastSynced={statsByUser.get(p.id)?.last_synced ?? null}
          />
        ))}
      </div>
    </div>
  )
}
