import { createSupabaseServerClient } from '@/lib/supabase-server'
import { summarizeUsage, fmtSek, USD_SEK_RATE, type UsageStatsRow } from '@/lib/llm-pricing'
import AdminUserRow from '@/components/AdminUserRow'
import FeatureShowcaseSender from '@/components/FeatureShowcaseSender'
import MonthlyReportSender from '@/components/MonthlyReportSender'
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

  const [{ data: profiles }, { data: syncStatus }, { data: yazioStatus }, { data: activityStats }, { data: callStats }, { data: recentEvents }, { data: newsletterRecipients }, { data: llmUsage }] = await Promise.all([
    supabase.rpc('admin_list_profiles'),
    supabase.rpc('admin_all_sync_status'),
    supabase.rpc('admin_yazio_status'),
    supabase.rpc('admin_activity_stats'),
    supabase.rpc('admin_api_call_stats'),
    supabase.rpc('admin_recent_events'),
    supabase.rpc('admin_newsletter_recipients'),
    supabase.rpc('admin_llm_usage_stats'),
  ])

  type SyncRow = { user_id: string; has_concept2: boolean; has_garmin: boolean; concept2_synced: boolean; garmin_synced: boolean }
  type YazioRow = { user_id: string; has_yazio: boolean; yazio_synced: boolean }
  type ActivityStatsRow = { user_id: string; activity_count: number; days_synced: number; last_synced: string }
  type ProfileRow = { id: string; email: string; name: string | null; created_at: string; locked: boolean | null; flagged_attempts: number | null }
  type CallStatsRow = { user_id: string; calls_today: number; calls_7d: number }
  type EventRow = { event_type: 'signup' | 'activity'; user_id: string; email: string; name: string | null; label: string; occurred_at: string }
  const syncByUser = new Map<string, SyncRow>((syncStatus ?? []).map((s: SyncRow) => [s.user_id, s]))
  const yazioByUser = new Map<string, YazioRow>((yazioStatus ?? []).map((y: YazioRow) => [y.user_id, y]))
  const statsByUser = new Map<string, ActivityStatsRow>((activityStats ?? []).map((s: ActivityStatsRow) => [s.user_id, s]))
  const callsByUser = new Map<string, CallStatsRow>((callStats ?? []).map((c: CallStatsRow) => [c.user_id, c]))
  const { byUser: costByUser, total: costTotal } = summarizeUsage((llmUsage ?? []) as UsageStatsRow[])
  const profileRows = (profiles ?? []) as ProfileRow[]
  const eventRows = (recentEvents ?? []) as EventRow[]

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-muted text-sm mt-1">{profileRows.length} registrerade användare</p>
      </div>

      <div className="bg-card border border-edge rounded-xl p-4 mb-6">
        <div className="text-xs text-muted uppercase tracking-wider mb-1">AI-kostnad (uppskattad)</div>
        <div className="flex items-baseline gap-x-6 gap-y-1 flex-wrap">
          <div><span className="font-mono text-2xl font-bold text-accent">{fmtSek(costTotal.sek30d)}</span> <span className="text-muted text-xs">senaste 30 dagarna · {costTotal.calls30d} anrop</span></div>
          <div><span className="font-mono text-fg text-sm">{fmtSek(costTotal.sekAll)}</span> <span className="text-muted text-xs">totalt sedan mätningen startade 3 okt · {costTotal.callsAll} anrop</span></div>
        </div>
        <p className="text-muted text-[11px] mt-2">Räknat på antal tokens × Googles listpris, {USD_SEK_RATE} kr/USD. Anrop med egen nyckel räknas inte (användaren betalar själv). Googles faktura är facit.</p>
      </div>

      <FeatureShowcaseSender recipientCount={(newsletterRecipients ?? []).length} />
      <MonthlyReportSender />
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
            hasYazio={!!yazioByUser.get(p.id)?.has_yazio}
            yazioSynced={!!yazioByUser.get(p.id)?.yazio_synced}
            activityCount={statsByUser.get(p.id)?.activity_count ?? 0}
            daysSynced={statsByUser.get(p.id)?.days_synced ?? 0}
            lastSynced={statsByUser.get(p.id)?.last_synced ?? null}
            callsToday={callsByUser.get(p.id)?.calls_today ?? 0}
            calls7d={callsByUser.get(p.id)?.calls_7d ?? 0}
            aiCost30dSek={costByUser.get(p.id)?.sek30d ?? 0}
            aiCostAllSek={costByUser.get(p.id)?.sekAll ?? 0}
            aiCalls30d={costByUser.get(p.id)?.calls30d ?? 0}
            aiOwnKeyCalls30d={costByUser.get(p.id)?.ownKeyCalls30d ?? 0}
          />
        ))}
      </div>
    </div>
  )
}
