import { createSupabaseServerClient } from '@/lib/supabase-server'
import AdminUserRow from '@/components/AdminUserRow'
import NewsletterSender from '@/components/NewsletterSender'
import DemoResetButton from '@/components/DemoResetButton'

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

  const [{ data: profiles }, { data: syncStatus }, { data: activityStats }, { data: callStats }, { data: recentEvents }, { data: newsletterRecipients }] = await Promise.all([
    supabase.rpc('admin_list_profiles'),
    supabase.rpc('admin_all_sync_status'),
    supabase.rpc('admin_activity_stats'),
    supabase.rpc('admin_api_call_stats'),
    supabase.rpc('admin_recent_events'),
    supabase.rpc('admin_newsletter_recipients'),
  ])

  type SyncRow = { user_id: string; has_concept2: boolean; has_garmin: boolean; concept2_synced: boolean; garmin_synced: boolean }
  type ActivityStatsRow = { user_id: string; activity_count: number; days_synced: number; last_synced: string }
  type ProfileRow = { id: string; email: string; name: string | null; created_at: string; locked: boolean | null; flagged_attempts: number | null }
  type CallStatsRow = { user_id: string; calls_today: number; calls_7d: number }
  type EventRow = { event_type: 'signup' | 'activity'; user_id: string; email: string; name: string | null; label: string; occurred_at: string }
  const syncByUser = new Map<string, SyncRow>((syncStatus ?? []).map((s: SyncRow) => [s.user_id, s]))
  const statsByUser = new Map<string, ActivityStatsRow>((activityStats ?? []).map((s: ActivityStatsRow) => [s.user_id, s]))
  const callsByUser = new Map<string, CallStatsRow>((callStats ?? []).map((c: CallStatsRow) => [c.user_id, c]))
  const profileRows = (profiles ?? []) as ProfileRow[]
  const eventRows = (recentEvents ?? []) as EventRow[]

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-muted text-sm mt-1">{profileRows.length} registrerade användare</p>
      </div>

      <NewsletterSender recipientCount={(newsletterRecipients ?? []).length} />
      <DemoResetButton />

      {eventRows.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-muted mb-2">Senaste händelser</h2>
          <div className="bg-card border border-edge rounded-xl divide-y divide-edge">
            {eventRows.map((e, i) => (
              <div key={i} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0 truncate">
                  <span className="text-fg">{e.name || e.email}</span>
                  <span className="text-muted"> — {e.event_type === 'signup' ? 'Nytt konto' : `nytt pass: ${e.label}`}</span>
                </div>
                <div className="text-muted flex-shrink-0">{new Date(e.occurred_at).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {profileRows.map(p => (
          <AdminUserRow
            key={p.id}
            profile={p}
            isSelf={p.id === user.id}
            hasConcept2={!!syncByUser.get(p.id)?.has_concept2}
            hasGarmin={!!syncByUser.get(p.id)?.has_garmin}
            concept2Synced={!!syncByUser.get(p.id)?.concept2_synced}
            garminSynced={!!syncByUser.get(p.id)?.garmin_synced}
            activityCount={statsByUser.get(p.id)?.activity_count ?? 0}
            daysSynced={statsByUser.get(p.id)?.days_synced ?? 0}
            lastSynced={statsByUser.get(p.id)?.last_synced ?? null}
            callsToday={callsByUser.get(p.id)?.calls_today ?? 0}
            calls7d={callsByUser.get(p.id)?.calls_7d ?? 0}
          />
        ))}
      </div>
    </div>
  )
}
