import { createSupabaseServerClient } from '@/lib/supabase-server'
import ProfileForm from '@/components/ProfileForm'
import GoalsCard from '@/components/GoalsCard'
import FriendsCard from '@/components/FriendsCard'
import NotificationSettings from '@/components/NotificationSettings'
import { dedupeForStats, type ActivityRow } from '@/lib/duplicates'

const DEFICIT_TRAINING_LOOKBACK_DAYS = 28
const DEFICIT_MIN_TRAINING_HISTORY_DAYS = 14

export default async function ProfilPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: c2token }, { data: stravaToken }, { data: polarToken }, { data: ctxRow }, { data: garminCredsRow }, { data: yazioCredsRow }, { data: yazioDebugRow }, { data: goals }, { data: overviewRow }, { data: concept2Activity }, { data: garminActivity }, { data: stravaActivity }, { data: polarActivity }, { data: pendingRequests }, { data: myFollows }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('concept2_tokens').select('user_id').eq('user_id', user.id).single(),
    supabase.from('strava_tokens').select('user_id').eq('user_id', user.id).single(),
    supabase.from('polar_tokens').select('user_id').eq('user_id', user.id).single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'user_context').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_credentials').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'yazio_credentials').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'yazio_raw_debug').single(),
    supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'goals_overview').single(),
    // "Connected" only means credentials are saved — these confirm at least
    // one pass has actually synced, same distinction the admin view already
    // makes (Daniel: a badge that only means "uppgifter sparade" instead of
    // "fungerar" was misleading there too; this page had the same gap).
    supabase.from('activities').select('id').eq('user_id', user.id).eq('source', 'concept2').limit(1).maybeSingle(),
    supabase.from('activities').select('id').eq('user_id', user.id).eq('source', 'garmin').limit(1).maybeSingle(),
    supabase.from('activities').select('id').eq('user_id', user.id).eq('source', 'strava').limit(1).maybeSingle(),
    supabase.from('activities').select('id').eq('user_id', user.id).eq('source', 'polar').limit(1).maybeSingle(),
    supabase.rpc('pending_follow_requests'),
    supabase.rpc('my_follows'),
  ])

  const savedContext = (ctxRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content ?? ''
  const garminCredsRaw = (garminCredsRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const hasGarmin = !!garminCredsRaw
  const yazioCredsRaw = (yazioCredsRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const hasYazio = !!yazioCredsRaw
  const yazioSynced = !!(yazioDebugRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const concept2Synced = !!concept2Activity
  const garminSynced = !!garminActivity
  const stravaSynced = !!stravaActivity
  const polarSynced = !!polarActivity
  const savedOverview = (overviewRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content ?? ''

  // Live preview for the Viktmål card below — same 28-day-mean-including-
  // rest-days definition lib/deficit.ts's real budget calc uses, deduped so
  // a Concept2+Garmin pair of the same session isn't counted twice. null
  // (not 0) below the minimum history so the card shows the fallback-
  // estimate chips instead of a thin, noisy real average.
  const trainingLookbackStart = new Date()
  trainingLookbackStart.setDate(trainingLookbackStart.getDate() - DEFICIT_TRAINING_LOOKBACK_DAYS)
  const { data: recentActs } = await supabase
    .from('activities')
    .select('id, strava_id, source, start_date, distance, moving_time, sport_type, calories')
    .eq('user_id', user.id)
    .gte('start_date', trainingLookbackStart.toISOString())
  const dedupedRecentActs = dedupeForStats((recentActs ?? []) as (ActivityRow & { calories?: number | null })[])
  const trainingDaysWithActivity = new Set(dedupedRecentActs.map(a => a.start_date.slice(0, 10))).size
  const avgTrainingKcalRaw = trainingDaysWithActivity >= DEFICIT_MIN_TRAINING_HISTORY_DAYS
    ? dedupedRecentActs.reduce((s, a) => s + (a.calories ?? 0), 0) / DEFICIT_TRAINING_LOOKBACK_DAYS
    : null

  return (
    <div className="p-4 md:p-8 max-w-lg w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Profil</h1>
        <p className="text-muted text-sm mt-1">Inställningar och anslutningar</p>
      </div>
      {error === 'concept2_taken' && (
        <div className="mb-4 bg-card border border-red-500/40 rounded-2xl p-4 text-sm text-fg">
          Det här Concept2-kontot är redan anslutet till en annan DL Trainer-profil. Varje person behöver sitt eget Concept2-konto.
        </div>
      )}
      {error === 'demo_blocked' && (
        <div className="mb-4 bg-card border border-amber-500/30 rounded-2xl p-4 text-sm text-fg">
          Det här är demo-kontot — skapa ett eget konto för att ansluta en riktig träningskälla.
        </div>
      )}
      {(error === 'concept2_auth' || error === 'concept2_failed') && (
        <div className="mb-4 bg-card border border-amber-500/30 rounded-2xl p-4 text-sm text-fg">
          Kunde inte ansluta Concept2. Försök igen.
        </div>
      )}
      {error === 'strava_taken' && (
        <div className="mb-4 bg-card border border-red-500/40 rounded-2xl p-4 text-sm text-fg">
          Det här Strava-kontot är redan anslutet till en annan DL Trainer-profil. Varje person behöver sitt eget Strava-konto.
        </div>
      )}
      {(error === 'strava_auth' || error === 'strava_failed') && (
        <div className="mb-4 bg-card border border-amber-500/30 rounded-2xl p-4 text-sm text-fg">
          Kunde inte ansluta Strava. Försök igen.
        </div>
      )}
      {error === 'polar_taken' && (
        <div className="mb-4 bg-card border border-red-500/40 rounded-2xl p-4 text-sm text-fg">
          Det här Polar-kontot är redan anslutet till en annan DL Trainer-profil. Varje person behöver sitt eget Polar-konto.
        </div>
      )}
      {(error === 'polar_auth' || error === 'polar_failed') && (
        <div className="mb-4 bg-card border border-amber-500/30 rounded-2xl p-4 text-sm text-fg">
          Kunde inte ansluta Polar. Försök igen.
        </div>
      )}
      <div className="mb-4">
        <NotificationSettings />
      </div>
      <div className="mb-4">
        <GoalsCard goals={goals ?? []} savedOverview={savedOverview} />
      </div>
      <div className="mb-4">
        <FriendsCard
          userId={user.id}
          initialPendingRequests={pendingRequests ?? []}
          initialMyFollows={myFollows ?? []}
        />
      </div>
      <ProfileForm
        profile={profile}
        userEmail={user.email ?? ''}
        hasConcept2={!!c2token}
        hasGarmin={hasGarmin}
        hasStrava={!!stravaToken}
        hasPolar={!!polarToken}
        hasYazio={hasYazio}
        concept2Synced={concept2Synced}
        garminSynced={garminSynced}
        stravaSynced={stravaSynced}
        polarSynced={polarSynced}
        yazioSynced={yazioSynced}
        savedContext={savedContext}
        avgTrainingKcalRaw={avgTrainingKcalRaw}
      />
    </div>
  )
}
