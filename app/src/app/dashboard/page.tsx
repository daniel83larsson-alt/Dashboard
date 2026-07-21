import { createSupabaseServerClient } from '@/lib/supabase-server'
import FeedbackDrawer from '@/components/FeedbackDrawer'
import WeeklyPlanSummaryCard from '@/components/WeeklyPlanSummaryCard'
import ActivityCalendar from '@/components/ActivityCalendar'
import { startOfWeek, stockholmDateKey, stockholmDayElapsedFraction } from '@/lib/dates'
import { estimateBMR } from '@/lib/bmr'
import AutoSync from '@/components/AutoSync'
import SyncAllButton from '@/components/SyncAllButton'
import OnboardingWizard from '@/components/OnboardingWizard'
import { sportLabel, sportIcon, fmtSpeedOrPace } from '@/lib/sport'
import { aggregateZones, zoneCoverageCount } from '@/lib/zones'
import ZoneBar from '@/components/ZoneBar'
import { dedupeForStats } from '@/lib/duplicates'
import { currentDailyStreak, currentWeeklyStreak, currentStepGoalStreak } from '@/lib/streaks'
import { newRecordsForLatest } from '@/lib/records'
import { weeklyLoad, rollingBaselineLoad } from '@/lib/load'
import FriendFeed from '@/components/FriendFeed'
import FriendRequestBadge from '@/components/FriendRequestBadge'
import InstallAppButton from '@/components/InstallAppButton'
import { hrvStatusLabel } from '@/lib/wellness'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtKm(m: number) { return (m / 1000).toFixed(1) + ' km' }

function fmtDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

function fmtDateLong(d: string) {
  return new Date(d).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
}

function shortTake(text: string, max = 140): string {
  const clean = text.replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + '…' : clean
}

// ── PR helpers ────────────────────────────────────────────────────────────────

type Activity = {
  id: string
  strava_id: number
  description?: string | null
  start_date: string
  distance: number
  moving_time: number
  average_heartrate?: number
  max_heartrate?: number
  average_watts?: number
  name: string
  sport_type: string
  hr_zones?: unknown
  calories?: number | null
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Computed up front (pure — doesn't depend on any fetched data) so the
  // training_plans lookup below can filter on it inside the same
  // Promise.all batch instead of a second round-trip.
  const weekStartDate = startOfWeek(new Date())
  const weekStartStr = weekStartDate.toISOString().slice(0, 10)
  const prevWeekStartDate = new Date(weekStartDate)
  prevWeekStartDate.setDate(prevWeekStartDate.getDate() - 7)
  const prevWeekStartStr = prevWeekStartDate.toISOString().slice(0, 10)

  const [{ data: profile }, { data: allActivities }, { data: goals }, { data: planRow }, { data: prevPlanRow }, { data: wellnessRow }, { data: ctxRow }, { data: overviewRow }, { data: insightRow }, { data: healthInsightRow }, { data: friendFeed }, { data: pendingRequests }, { data: recentFoodLog }] = await Promise.all([
    supabase.from('profiles').select('name, created_at, home_equipment, selected_sports, onboarding_dismissed_at, last_onboarding_prompt_at, daily_step_goal, weekly_load_goal, weight_kg, height_cm, birth_year, biological_sex, daily_calorie_goal').eq('id', user.id).single(),
    // Narrowed from select('*') — this fetches every activity ever logged
    // (grows without bound) so dropping unused columns matters. strava_id
    // stays: dedupeForStats() needs it for Concept2/Garmin pair matching.
    // hr_zones is selected as a JSON-path projection (`hr_zones:raw_data->
    // hrZones`) rather than the full raw_data column — dedupeForStats/
    // aggregateZones only ever read that one field, and raw_data (the whole
    // cached Garmin/Concept2 API response per pass) made this query several
    // MB for an account with 800+ activities, which was the dominant cost
    // in the reported cold-start delay (measured: ~3MB → ~290KB for this
    // query alone after narrowing). PR/streak detection genuinely needs the
    // full history, not just a recent slice, so no date/row limit here.
    supabase.from('activities').select('id, strava_id, sport_type, name, distance, moving_time, average_heartrate, max_heartrate, average_watts, start_date, hr_zones:raw_data->hrZones, calories, description').eq('user_id', user.id).order('start_date', { ascending: false }),
    supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active'),
    // Replaces the old coach_sessions('weekly_plan') JSON blob — this week's
    // plan (if generated) plus its sessions in one round-trip via the FK
    // relationship, ordered so the card can render Mon→Sun directly.
    supabase.from('training_plans').select('*, plan_sessions(*)').eq('user_id', user.id).eq('week_start', weekStartStr).maybeSingle(),
    // Just for pre-filling the sport picker's auto-generate carry-over — see
    // WeeklyPlanSummaryCard's initialSports prop below.
    supabase.from('training_plans').select('requested_sports').eq('user_id', user.id).eq('week_start', prevWeekStartStr).maybeSingle(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_wellness').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'user_context').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'goals_overview').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'insights').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'health_insights').single(),
    supabase.rpc('friend_activity_feed'),
    supabase.rpc('pending_follow_requests'),
    supabase.from('food_log').select('calories, protein_g, logged_at').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(50),
  ])

  const userBio = (ctxRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content ?? ''
  const overviewGoal = (overviewRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content ?? ''

  type DayWellness = {
    date: string
    restingHR: number | null
    sleepHours: number | null
    deepSleepHours: number | null
    remSleepHours: number | null
    lightSleepHours: number | null
    steps: number | null
    bodyBattery: number | null
    hrv: number | null
    hrvStatus: string | null
  }
  type WellnessStore = { history: DayWellness[]; updatedAt: string }
  const wellnessRaw = (wellnessRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const wellnessStore: WellnessStore | null = wellnessRaw ? (() => { try { return JSON.parse(wellnessRaw) } catch { return null } })() : null
  const wellness: DayWellness | null = wellnessStore?.history?.[0] ?? null
  const stepGoal = profile?.daily_step_goal ?? 10000

  // Concept2 + Garmin can both sync the same real session — count it once
  // in every stat/PR below, not twice, using the more precise Concept2 row
  // when a pair is found.
  const activities: Activity[] = dedupeForStats(allActivities ?? [])
  const latest = activities[0] ?? null
  const { data: latestKudosRow } = latest
    ? await supabase.rpc('kudos_received', { target_activity_id: latest.id }).single()
    : { data: null }
  const latestKudos = (latestKudosRow as { kudos_count: number; giver_names: string[] } | null) ?? { kudos_count: 0, giver_names: [] }
  const latestSpeedOrPace = latest ? fmtSpeedOrPace(latest.sport_type, latest.distance, latest.moving_time) : null
  const latestRecords = latest ? newRecordsForLatest(latest, activities.slice(1)) : []

  const dailyStreak = currentDailyStreak(activities)
  const weeklyStreak = currentWeeklyStreak(activities)
  const stepStreak = currentStepGoalStreak(wellnessStore?.history ?? [], stepGoal)

  // ── Date boundaries ────────────────────────────────────────────────────────
  const now = new Date()
  const weekStart = startOfWeek(now)

  const thisWeek  = activities.filter(a => new Date(a.start_date) >= weekStart)

  function totals(arr: Activity[]) {
    const sports = new Set(arr.map(a => a.sport_type))
    return {
      count: arr.length,
      dist: arr.reduce((s, a) => s + (a.distance ?? 0), 0),
      time: arr.reduce((s, a) => s + (a.moving_time ?? 0), 0),
      // Only one meaningful pace/speed figure when the period isn't a mix of sports
      singleSport: sports.size === 1 ? [...sports][0] : null,
    }
  }

  const wk = totals(thisWeek)

  const weekZones = aggregateZones(thisWeek)
  const weekZoneCoverage = zoneCoverageCount(thisWeek)

  // ── Training load ──────────────────────────────────────────────────────────
  // Personal-max-HR proxy: highest max_heartrate ever actually recorded,
  // since we don't collect age/a real max-HR test. Resting HR comes from
  // today's synced wellness (falls back to null → flat-intensity load below).
  const nextWeekStart = new Date(weekStart)
  nextWeekStart.setDate(nextWeekStart.getDate() + 7)
  const personalMaxHR = activities.reduce((m, a) => a.max_heartrate && a.max_heartrate > m ? a.max_heartrate : m, 0) || null
  const restingHRForLoad = wellness?.restingHR ?? null
  const weekLoad = weeklyLoad(activities, restingHRForLoad, personalMaxHR, weekStart, nextWeekStart)
  const loadGoal = profile?.weekly_load_goal ?? rollingBaselineLoad(activities, restingHRForLoad, personalMaxHR, now)
  const loadPct = loadGoal ? Math.round((weekLoad / loadGoal) * 100) : null

  // ── Kalorier idag ─────────────────────────────────────────────────────────
  // "Bränt idag" = summan av redan uträknade träningspass-kalorier (kolumnen
  // finns redan per rad) plus en uppskattad basförbränning — men bara den
  // andel av dygnet som faktiskt har gått, annars ser en koll klockan 9 ut
  // som att man redan bränt ett helt dygns vila. dedupeForStats säkerställer
  // att ett Concept2+Garmin-par för samma pass inte räknas dubbelt.
  const todayKey = stockholmDateKey(now)
  const activityCaloriesToday = activities
    .filter(a => stockholmDateKey(new Date(a.start_date)) === todayKey)
    .reduce((s, a) => s + (a.calories ?? 0), 0)
  const foodLogToday = (recentFoodLog ?? []).filter(f => stockholmDateKey(new Date(f.logged_at)) === todayKey)
  const eatenToday = foodLogToday.reduce((s, f) => s + (f.calories ?? 0), 0)
  const proteinToday = foodLogToday.reduce((s, f) => s + (f.protein_g ?? 0), 0)
  const bmrResult = estimateBMR({
    weightKg: profile?.weight_kg ?? null,
    heightCm: profile?.height_cm ?? null,
    birthYear: profile?.birth_year ?? null,
    biologicalSex: profile?.biological_sex ?? null,
  }, now)
  const burnedProjected = bmrResult.bmr + activityCaloriesToday
  const burnedSoFar = Math.round(bmrResult.bmr * stockholmDayElapsedFraction(now)) + activityCaloriesToday
  const showCalorieCard = !!profile?.daily_calorie_goal || eatenToday > 0

  const firstName = (profile?.name ?? user.email ?? 'Tränare').split(' ')[0]
  const hour = now.getHours()
  const greeting = hour < 10 ? 'God morgon' : hour < 18 ? 'Hej' : 'God kväll'

  // Onboarding: goals OR context missing means the coach team is working
  // blind (see the equipment/sports feature — a user got advice that
  // assumed gear they didn't have). The light checklist below always
  // shows a way in; after a month with still nothing filled in, the
  // wizard also opens itself once with an explanation, throttled to at
  // most once every 14 days so it doesn't nag on every visit.
  const hasGoalsInfo = (goals ?? []).length > 0 || overviewGoal.trim().length > 0
  const hasContextInfo = userBio.trim().length > 0
  const needsOnboarding = !hasGoalsInfo || !hasContextInfo
  const accountAgeDays = profile?.created_at ? (now.getTime() - new Date(profile.created_at).getTime()) / 86400000 : 0
  const promptedRecently = profile?.last_onboarding_prompt_at
    ? (now.getTime() - new Date(profile.last_onboarding_prompt_at).getTime()) / 86400000 < 14
    : false
  const showInterview = needsOnboarding && accountAgeDays >= 30 && !promptedRecently
  if (showInterview) {
    await supabase.from('profiles').update({ last_onboarding_prompt_at: now.toISOString() }).eq('id', user.id)
  }

  type PlanSessionRow = {
    id: string; planned_date: string; is_rest: boolean; sport_type: string | null
    title: string; description: string; status: 'planned' | 'done' | 'skipped' | 'missed'; matched_activity_id: string | null
  }
  const weeklyPlan = planRow ? {
    id: planRow.id as string,
    weekStart: planRow.week_start as string,
    planType: planRow.plan_type as 'mot_mal' | 'adaptiv',
    philosophy: planRow.philosophy as string,
    focusAreas: (planRow.focus_areas ?? []) as string[],
    sessions: ((planRow.plan_sessions ?? []) as PlanSessionRow[])
      .slice()
      .sort((a, b) => a.planned_date.localeCompare(b.planned_date)),
  } : null

  // Ghost markers on the calendar: only still-open (not yet done/skipped)
  // non-rest sessions — once logged/matched it shows as a real "trained"
  // day instead, and a skipped one shouldn't look like an outstanding gap.
  const plannedDates = (weeklyPlan?.sessions ?? [])
    .filter(s => !s.is_rest && s.status === 'planned')
    .map(s => s.planned_date)

  // Latest team insights, for a short desktop-sidebar teaser — reuses
  // whatever's already been generated on Insikter/Hälsa, no extra AI calls.
  const insightRaw = (insightRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const savedInsight = insightRaw ? (() => { try { return JSON.parse(insightRaw) } catch { return null } })() : null
  const healthInsightRaw = (healthInsightRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const savedHealthInsight = healthInsightRaw ? (() => { try { return JSON.parse(healthInsightRaw) } catch { return null } })() : null

  return (
    <div className="p-4 md:p-8 max-w-2xl lg:max-w-6xl w-full mx-auto space-y-6">
      <AutoSync />

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{greeting}, {firstName}</h1>
          <p className="text-muted text-sm mt-1">
            {thisWeek.length > 0
              ? `${thisWeek.length} pass · ${fmtKm(wk.dist)} denna vecka`
              : 'Inga pass denna veckan ännu'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FriendRequestBadge count={pendingRequests?.length ?? 0} />
          <InstallAppButton />
          <SyncAllButton />
        </div>
      </div>

      {/* ── Streaks ───────────────────────────────────────────────────────────── */}
      {activities.length > 0 && (
        <div className={`grid gap-2 ${(wellnessStore?.history?.length ?? 0) > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <div className="bg-card border border-edge rounded-2xl p-4">
            <div className="font-mono text-accent text-2xl font-bold leading-none">🔥 {dailyStreak}</div>
            <div className="text-muted text-xs mt-1">{dailyStreak === 1 ? 'dag i rad' : 'dagar i rad'}</div>
          </div>
          <div className="bg-card border border-edge rounded-2xl p-4">
            <div className="font-mono text-accent text-2xl font-bold leading-none">🔥 {weeklyStreak}</div>
            <div className="text-muted text-xs mt-1">{weeklyStreak === 1 ? 'vecka i rad' : 'veckor i rad'}</div>
          </div>
          {(wellnessStore?.history?.length ?? 0) > 0 && (
            <div className="bg-card border border-edge rounded-2xl p-4">
              <div className="font-mono text-accent text-2xl font-bold leading-none">🔥 {stepStreak}</div>
              <div className="text-muted text-xs mt-1">{stepStreak === 1 ? 'dag med stegmål' : 'dagar med stegmål'}</div>
            </div>
          )}
        </div>
      )}

      {/* ── Veckobelastning ───────────────────────────────────────────────────── */}
      {activities.length > 0 && weekLoad > 0 && loadGoal != null && (
        <div className="bg-card border border-edge rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted uppercase tracking-wider">Veckobelastning</div>
            <div className="text-xs text-muted">
              {profile?.weekly_load_goal ? 'mot ditt mål' : 'mot ditt eget snitt'}
            </div>
          </div>
          <div className="h-2.5 bg-bg rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${loadPct !== null && loadPct > 130 ? 'bg-amber-500' : 'bg-accent'}`}
              style={{ width: `${Math.min(loadPct ?? 0, 100)}%` }}
            />
          </div>
          <div className="text-muted text-xs mt-1.5">
            {loadPct}% denna vecka
            {loadPct !== null && loadPct > 130 && ' · klart mer än vanligt, tänk på återhämtning'}
          </div>
        </div>
      )}

      {/* ── Kalorier idag ─────────────────────────────────────────────────────── */}
      {showCalorieCard ? (
        <div className="bg-card border border-edge rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted uppercase tracking-wider">Kalorier idag</div>
            <a href="/dashboard/mat" className="text-xs text-accent hover:underline">Logga mat →</a>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-accent text-2xl font-bold">{eatenToday}</span>
            <span className="text-muted text-xs">
              ätit{profile?.daily_calorie_goal ? ` / ${profile.daily_calorie_goal} mål` : ''}
            </span>
          </div>
          {profile?.daily_calorie_goal && (
            <div className="h-2 bg-bg rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-accent rounded-full"
                style={{ width: `${Math.min(100, Math.round((eatenToday / profile.daily_calorie_goal) * 100))}%` }}
              />
            </div>
          )}
          <div className="text-muted text-xs mt-2">
            Förbränt (uppskattning): ~{burnedSoFar} kcal · beräknad dygnsförbränning ~{burnedProjected}
            {bmrResult.usedDefaults.length > 0 && (
              <> · baserat på schablonvärden, <a href="/dashboard/profil" className="text-accent hover:underline">fyll i i Profil</a> för mer exakt</>
            )}
          </div>
          {proteinToday > 0 && (
            <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-edge">
              <span className="text-muted text-xs">Protein (uppskattat)</span>
              <span className="font-mono text-fg text-sm">{Math.round(proteinToday)} g</span>
            </div>
          )}
        </div>
      ) : (
        <a href="/dashboard/mat" className="bg-card border border-edge rounded-2xl p-4 block hover:border-accent/30 transition-colors">
          <div className="text-sm font-medium">🍽 Sätt ett kalorimål</div>
          <div className="text-muted text-xs mt-1">Logga vad du äter och se det mot vad du bränner — sök, fota eller snabbval.</div>
        </a>
      )}

      {/* ── Kom igång-checklista ─────────────────────────────────────────────── */}
      {(() => {
        const hasActivities = activities.length > 0
        const hasEquipmentInfo = (profile?.home_equipment?.length ?? 0) > 0 || (profile?.selected_sports?.length ?? 0) > 0
        if (hasActivities && hasGoalsInfo && hasContextInfo) return null

        const steps = [
          { done: hasActivities, label: 'Anslut en träningskälla', hint: 'Concept2 eller Garmin' },
          { done: hasGoalsInfo, label: 'Sätt ett mål', hint: 'styr veckoplanen och coachens råd' },
          { done: hasContextInfo, label: 'Berätta om dig själv', hint: 'jobb, situation, personlighet' },
          { done: hasEquipmentInfo, label: 'Ange utrustning & aktiviteter', hint: 'så tipsen utgår från det du faktiskt har' },
        ]

        return (
          <div className="bg-card border border-accent/30 rounded-2xl p-4">
            <div className="text-xs text-accent uppercase tracking-wider mb-3">Kom igång</div>
            <div className="flex flex-col gap-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${s.done ? 'bg-accent text-bg' : 'border border-edge text-muted'}`}>
                    {s.done ? '✓' : i + 1}
                  </span>
                  <div className="text-sm">
                    <span className={s.done ? 'text-muted line-through' : 'text-fg'}>{s.label}</span>
                    <span className="text-muted text-xs ml-2">{s.hint}</span>
                  </div>
                </div>
              ))}
            </div>
            <OnboardingWizard
              autoOpen={showInterview}
              initialOverview={overviewGoal}
              initialContext={userBio}
              initialEquipment={profile?.home_equipment ?? []}
              initialSports={profile?.selected_sports ?? []}
            />
          </div>
        )
      })()}

      <div className="lg:grid lg:grid-cols-3 lg:gap-6 lg:[grid-auto-flow:dense] space-y-6 lg:space-y-0">

      {/* ── Senaste pass ────────────────────────────────────────────────────── */}
      {latest ? (
        <div className="bg-card border border-edge rounded-2xl p-5 lg:col-span-2 lg:order-1">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs text-muted uppercase tracking-wider mb-1">Senaste pass</div>
              <div className="font-medium text-fg">{latest.name}</div>
              <div className="text-muted text-xs mt-0.5">{fmtDateLong(latest.start_date)}</div>
            </div>
            <span className="text-xs bg-bg text-muted px-2 py-1 rounded-lg flex-shrink-0 ml-2 flex items-center gap-1">
              <span>{sportIcon(latest.sport_type)}</span>
              <span className="capitalize">{sportLabel(latest.sport_type)}</span>
            </span>
          </div>

          {latestRecords.length > 0 && (
            <a
              href="/dashboard/halsa?tab=rekord"
              className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 mb-3 hover:border-amber-500/50 transition-colors"
            >
              <span className="text-lg">🏅</span>
              <span className="text-xs text-amber-400 font-medium">Nytt rekord: {latestRecords.join(' · ')}</span>
            </a>
          )}

          {latestKudos.kudos_count > 0 && (
            <div className="flex items-center gap-2 bg-accent/10 border border-accent/30 rounded-xl px-3 py-2 mb-3">
              <span className="text-lg">👍</span>
              <span className="text-xs text-accent font-medium">
                {latestKudos.giver_names.join(', ')} gav tummen upp för det här passet
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-bg rounded-xl p-3">
              <div className="font-mono text-accent text-lg font-bold leading-none">{fmtKm(latest.distance)}</div>
              <div className="text-muted text-xs mt-1">Distans</div>
            </div>
            <div className="bg-bg rounded-xl p-3">
              <div className="font-mono text-accent text-lg font-bold leading-none">{fmtDur(latest.moving_time)}</div>
              <div className="text-muted text-xs mt-1">Tid</div>
            </div>
            {latestSpeedOrPace && (
              <div className="bg-bg rounded-xl p-3">
                <div className="font-mono text-lcd text-lg font-bold leading-none">{latestSpeedOrPace.value}</div>
                <div className="text-muted text-xs mt-1">{latestSpeedOrPace.label}</div>
              </div>
            )}
          </div>

          {(latest.average_heartrate || latest.average_watts) && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {latest.average_heartrate && (
                <div className="bg-bg rounded-xl p-3">
                  <div className="font-mono text-lcd text-lg font-bold leading-none">{Math.round(latest.average_heartrate)}</div>
                  <div className="text-muted text-xs mt-1">Snitt-HR</div>
                </div>
              )}
              {latest.max_heartrate && (
                <div className="bg-bg rounded-xl p-3">
                  <div className="font-mono text-lcd text-lg font-bold leading-none">{Math.round(latest.max_heartrate)}</div>
                  <div className="text-muted text-xs mt-1">Max-HR</div>
                </div>
              )}
              {latest.average_watts && (
                <div className="bg-bg rounded-xl p-3">
                  <div className="font-mono text-lcd text-lg font-bold leading-none">{Math.round(latest.average_watts)}W</div>
                  <div className="text-muted text-xs mt-1">Snitt-watt</div>
                </div>
              )}
            </div>
          )}

          <FeedbackDrawer activity={latest} />
        </div>
      ) : (
        <div className="bg-card border border-edge rounded-2xl p-8 text-center lg:col-span-2 lg:order-1">
          <div className="text-4xl mb-3">🚣</div>
          <div className="font-medium mb-2">Inga pass synkade ännu</div>
          <p className="text-muted text-sm mb-4">Anslut en träningskälla under Profil för att komma igång:</p>
          <div className="flex flex-col gap-2 text-left max-w-xs mx-auto mb-4">
            <div className="bg-bg rounded-xl px-3 py-2.5 text-xs text-muted">
              <span className="text-fg font-medium">1. Concept2</span> — för roddpass, klicka &quot;Anslut Concept2&quot; och logga in
            </div>
            <div className="bg-bg rounded-xl px-3 py-2.5 text-xs text-muted">
              <span className="text-fg font-medium">2. Garmin</span> — för alla aktiviteter + hälsodata, ange din vanliga Garmin-inloggning
            </div>
          </div>
          <a href="/dashboard/profil" className="inline-block bg-accent text-bg text-xs font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity">
            Gå till Profil
          </a>
        </div>
      )}

      {/* ── Senaste insikter (teaser, desktop sidebar) ───────────────────────── */}
      {(savedInsight?.agents?.summary || savedHealthInsight?.recovery) && (
        <div className="bg-card border border-edge rounded-2xl p-4 lg:order-2">
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Senaste insikter</h2>
          <div className="flex flex-col gap-3">
            {savedInsight?.agents?.summary && (
              <div>
                <div className="text-xs text-accent font-medium mb-1">🚣 Tränarteamet</div>
                <p className="text-xs text-fg/90 leading-relaxed">{shortTake(savedInsight.agents.summary)}</p>
                <a href="/dashboard/halsa?tab=insikter" className="text-xs text-accent hover:underline mt-1 inline-block">Se hela analysen →</a>
              </div>
            )}
            {savedHealthInsight?.recovery && (
              <div className={savedInsight?.agents?.summary ? 'pt-3 border-t border-edge' : ''}>
                <div className="text-xs text-accent font-medium mb-1">💤 Återhämtning</div>
                <p className="text-xs text-fg/90 leading-relaxed">{shortTake(savedHealthInsight.recovery)}</p>
                <a href="/dashboard/halsa" className="text-xs text-accent hover:underline mt-1 inline-block">Se hälsodata →</a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Garmin Wellness ───────────────────────────────────────────────────── */}
      {!wellness && latest && (
        <div className="bg-card border border-edge rounded-2xl p-5 text-center lg:col-span-2 lg:order-3">
          <div className="text-2xl mb-2">💓</div>
          <div className="text-sm font-medium mb-1">Ingen hälsodata än</div>
          <p className="text-muted text-xs mb-3">Anslut Garmin under Profil för sömn, puls, steg och Body Battery</p>
          <a href="/dashboard/profil" className="inline-block text-xs text-accent hover:underline">
            Gå till Profil →
          </a>
        </div>
      )}
      {wellness && (
        <div className="lg:col-span-2 lg:order-3">
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Wellness · Garmin</h2>
          <div className="grid grid-cols-2 gap-2">
            {wellness.restingHR && (
              <div className="bg-card border border-edge rounded-2xl p-4">
                <div className="font-mono text-lcd text-2xl font-bold leading-none">{wellness.restingHR}</div>
                <div className="text-muted text-xs mt-1">Vilopuls (bpm)</div>
              </div>
            )}
            {wellness.sleepHours != null && wellness.sleepHours > 0 && (
              <div className="bg-card border border-edge rounded-2xl p-4">
                <div className="font-mono text-accent text-2xl font-bold leading-none">{wellness.sleepHours.toFixed(1)}h</div>
                <div className="text-muted text-xs mt-1">Sömn igår</div>
                {wellness.deepSleepHours != null && wellness.remSleepHours != null && wellness.lightSleepHours != null && wellness.sleepHours > 0 && (
                  <div className="mt-2 flex h-2 rounded-full overflow-hidden gap-px">
                    <div className="bg-accent/90" style={{ width: `${(wellness.deepSleepHours / wellness.sleepHours) * 100}%` }} title="Djup" />
                    <div className="bg-lcd/70" style={{ width: `${(wellness.remSleepHours / wellness.sleepHours) * 100}%` }} title="REM" />
                    <div className="bg-edge" style={{ width: `${(wellness.lightSleepHours / wellness.sleepHours) * 100}%` }} title="Lätt" />
                  </div>
                )}
                {wellness.deepSleepHours != null && (
                  <div className="flex gap-2 mt-1.5 text-[10px] text-muted">
                    <span><span className="text-accent">▪</span> Djup {wellness.deepSleepHours.toFixed(1)}h</span>
                    {wellness.remSleepHours != null && <span><span className="text-lcd">▪</span> REM {wellness.remSleepHours.toFixed(1)}h</span>}
                  </div>
                )}
              </div>
            )}
            {wellness.steps != null && wellness.steps > 0 && (
              <div className="bg-card border border-edge rounded-2xl p-4">
                <div className="font-mono text-accent text-2xl font-bold leading-none">{wellness.steps.toLocaleString('sv-SE')}</div>
                <div className="text-muted text-xs mt-1">Steg idag</div>
                <div className="mt-2 h-1.5 bg-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${Math.min((wellness.steps / stepGoal) * 100, 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-muted mt-1">{Math.round((wellness.steps / stepGoal) * 100)}% av {stepGoal.toLocaleString('sv-SE')}</div>
              </div>
            )}
            {wellness.bodyBattery != null && (
              <div className="bg-card border border-edge rounded-2xl p-4">
                <div className={`font-mono text-2xl font-bold leading-none ${wellness.bodyBattery >= 0 ? 'text-accent' : 'text-red-400'}`}>
                  {wellness.bodyBattery >= 0 ? '+' : ''}{wellness.bodyBattery}
                </div>
                <div className="text-muted text-xs mt-1">Body Battery (natt)</div>
              </div>
            )}
            {wellness.hrv != null && (
              <div className="bg-card border border-edge rounded-2xl p-4">
                <div className="font-mono text-lcd text-2xl font-bold leading-none">{Math.round(wellness.hrv)}</div>
                <div className="text-muted text-xs mt-1">HRV (ms)</div>
                {wellness.hrvStatus && (
                  <div className="text-[10px] text-lcd mt-1">{hrvStatusLabel(wellness.hrvStatus)}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Veckans pulszoner ──────────────────────────────────────────────── */}
      {weekZones.length > 0 && (
        <div className="lg:order-4">
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Veckans pulszoner</h2>
          <div className="bg-card border border-edge rounded-2xl p-4">
            <ZoneBar zones={weekZones} />
            <div className="text-[10px] text-muted mt-3">
              Baserat på {weekZoneCoverage} av {thisWeek.length} pass denna vecka — resten fylls på gradvis
            </div>
          </div>
        </div>
      )}

      {/* ── Kalender ──────────────────────────────────────────────────────────── */}
      {activities.length > 0 && (
        <div className="lg:col-span-3 lg:order-8">
          <ActivityCalendar
            trainedDates={activities.map(a => a.start_date)}
            mobilityDates={activities.filter(a => a.sport_type === 'Mobility').map(a => a.start_date)}
            plannedDates={plannedDates}
          />
        </div>
      )}

      {/* ── Veckoplan + Mina mål (hålls ihop, Daniel: "kan lägga sig under
          veckoplan så håller man ihop det") ───────────────────────────────── */}
      <div className="lg:col-span-3 lg:order-9">
        <WeeklyPlanSummaryCard
          plan={weeklyPlan}
          hasActiveGoal={(goals?.length ?? 0) > 0}
          initialSports={(planRow?.requested_sports ?? prevPlanRow?.requested_sports ?? []) as string[]}
        />
      </div>

      <div className="lg:col-span-3 lg:order-10">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Mina mål</h2>
        {goals && goals.length > 0 ? (
          <div className="bg-card border border-edge rounded-2xl divide-y divide-edge">
            {goals.map(g => (
              <div key={g.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{g.title}</div>
                  {g.target_date && (
                    <div className="text-muted text-xs mt-0.5">
                      Mål: {new Date(g.target_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}
                    </div>
                  )}
                </div>
                <span className="text-xs bg-bg text-lcd px-2 py-1 rounded-lg">{g.goal_type}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-edge rounded-2xl p-6 text-center">
            <div className="text-muted text-sm">Inga aktiva mål</div>
            <p className="text-muted text-xs mt-1">
              <a href="/dashboard/profil" className="text-accent hover:underline">Sätt ett mål under Profil</a>
            </p>
          </div>
        )}
      </div>

      </div>

      {/* ── Vänners träningspass ──────────────────────────────────────────────── */}
      <FriendFeed feed={friendFeed ?? []} userId={user.id} />
    </div>
  )
}
