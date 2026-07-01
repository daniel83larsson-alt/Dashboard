import { createSupabaseServerClient } from '@/lib/supabase-server'
import FeedbackDrawer from '@/components/FeedbackDrawer'
import WeeklyPlanCard from '@/components/WeeklyPlanCard'
import ActivityCalendar from '@/components/ActivityCalendar'
import { startOfWeek } from '@/lib/dates'
import AutoSync from '@/components/AutoSync'
import SyncAllButton from '@/components/SyncAllButton'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtKm(m: number) { return (m / 1000).toFixed(1) + ' km' }

function fmtDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

function fmtPace(seconds: number, meters: number) {
  if (!meters) return '--'
  const p = (seconds / meters) * 500
  return `${Math.floor(p / 60)}:${Math.round(p % 60).toString().padStart(2, '0')}`
}

function fmtDateLong(d: string) {
  return new Date(d).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
}

// ── PR helpers ────────────────────────────────────────────────────────────────

type Activity = {
  id: string
  start_date: string
  distance: number
  moving_time: number
  average_heartrate?: number
  max_heartrate?: number
  average_watts?: number
  name: string
  sport_type: string
}

type PR = { value: number; unit: string; date: string; display: string }

function computePRs(acts: Activity[]) {
  const real = acts.filter(a => a.distance >= 1000 && a.moving_time >= 180)

  const best20 = real.filter(a => a.moving_time >= 1050 && a.moving_time <= 1350)
  const best30 = real.filter(a => a.moving_time >= 1620 && a.moving_time <= 1980)
  const best45 = real.filter(a => a.moving_time >= 2460 && a.moving_time <= 3000)
  const best5k  = real.filter(a => a.distance >= 4800 && a.distance <= 5200)

  function top<T extends Activity>(arr: T[], key: keyof T, dir: 'max' | 'min'): T | null {
    if (!arr.length) return null
    return arr.reduce((best, cur) =>
      dir === 'max' ? (cur[key] > best[key] ? cur : best) : (cur[key] < best[key] ? cur : best)
    )
  }

  const pr20 = top(best20, 'distance', 'max')
  const pr30 = top(best30, 'distance', 'max')
  const pr45 = top(best45, 'distance', 'max')
  const pr5k = top(best5k, 'moving_time', 'min')

  const prs: { label: string; pr: PR | null }[] = []

  if (pr20) prs.push({ label: 'Bäst 20 min', pr: { value: pr20.distance, unit: 'm', date: pr20.start_date, display: `${pr20.distance} m · ${fmtPace(pr20.moving_time, pr20.distance)}/500m` } })
  if (pr30) prs.push({ label: 'Bäst 30 min', pr: { value: pr30.distance, unit: 'm', date: pr30.start_date, display: `${pr30.distance} m · ${fmtPace(pr30.moving_time, pr30.distance)}/500m` } })
  if (pr45) prs.push({ label: 'Bäst 45 min', pr: { value: pr45.distance, unit: 'm', date: pr45.start_date, display: `${pr45.distance} m · ${fmtPace(pr45.moving_time, pr45.distance)}/500m` } })
  if (pr5k) prs.push({ label: 'Snabbaste 5 000 m', pr: { value: pr5k.moving_time, unit: 's', date: pr5k.start_date, display: `${fmtDur(pr5k.moving_time)} · ${fmtPace(pr5k.moving_time, pr5k.distance)}/500m` } })

  return prs
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: allActivities }, { data: goals }, { data: planRow }, { data: wellnessRow }, { data: ctxRow }, { data: overviewRow }] = await Promise.all([
    supabase.from('profiles').select('name').eq('id', user.id).single(),
    supabase.from('activities').select('*').eq('user_id', user.id).order('start_date', { ascending: false }),
    supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active'),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'weekly_plan').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_wellness').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'user_context').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'goals_overview').single(),
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

  const activities = allActivities ?? []
  const latest = activities[0] ?? null

  // ── Date boundaries ────────────────────────────────────────────────────────
  const now = new Date()
  const y = now.getFullYear()
  const mo = now.getMonth()
  const weekStart = startOfWeek(now)
  const monthStart = new Date(y, mo, 1)
  const yearStart  = new Date(y, 0, 1)

  const thisWeek  = activities.filter(a => new Date(a.start_date) >= weekStart)
  const thisMonth = activities.filter(a => new Date(a.start_date) >= monthStart)
  const thisYear  = activities.filter(a => new Date(a.start_date) >= yearStart)

  function totals(arr: Activity[]) {
    return {
      count: arr.length,
      dist: arr.reduce((s, a) => s + (a.distance ?? 0), 0),
      time: arr.reduce((s, a) => s + (a.moving_time ?? 0), 0),
    }
  }

  const wk = totals(thisWeek)
  const mm = totals(thisMonth)
  const yy = totals(thisYear)

  const prs = computePRs(activities)

  const firstName = (profile?.name ?? user.email ?? 'Daniel').split(' ')[0]
  const hour = now.getHours()
  const greeting = hour < 10 ? 'God morgon' : hour < 18 ? 'Hej' : 'God kväll'

  const savedPlan = (planRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content ?? null

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full space-y-6">
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
        <SyncAllButton />
      </div>

      {/* ── Kom igång-checklista ─────────────────────────────────────────────── */}
      {(() => {
        const hasActivities = activities.length > 0
        const hasGoals = (goals ?? []).length > 0 || overviewGoal.trim().length > 0
        const hasContext = userBio.trim().length > 0
        if (hasActivities && hasGoals && hasContext) return null

        const steps = [
          { done: hasActivities, label: 'Anslut en träningskälla', hint: 'Concept2 eller Garmin' },
          { done: hasGoals, label: 'Sätt ett mål', hint: 'styr veckoplanen och coachens råd' },
          { done: hasContext, label: 'Berätta om dig själv', hint: 'jobb, situation, personlighet — under "Om dig"' },
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
            <a href="/dashboard/profil" className="inline-block mt-3 text-xs text-accent hover:underline">
              Gå till Profil →
            </a>
          </div>
        )
      })()}

      {/* ── Senaste pass ────────────────────────────────────────────────────── */}
      {latest ? (
        <div className="bg-card border border-edge rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs text-muted uppercase tracking-wider mb-1">Senaste pass</div>
              <div className="font-medium text-fg">{latest.name}</div>
              <div className="text-muted text-xs mt-0.5">{fmtDateLong(latest.start_date)}</div>
            </div>
            <span className="text-xs bg-bg text-muted px-2 py-1 rounded-lg capitalize flex-shrink-0 ml-2">
              {latest.sport_type}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-bg rounded-xl p-3">
              <div className="font-mono text-accent text-lg font-bold leading-none">{fmtKm(latest.distance)}</div>
              <div className="text-muted text-xs mt-1">Distans</div>
            </div>
            <div className="bg-bg rounded-xl p-3">
              <div className="font-mono text-accent text-lg font-bold leading-none">{fmtDur(latest.moving_time)}</div>
              <div className="text-muted text-xs mt-1">Tid</div>
            </div>
            <div className="bg-bg rounded-xl p-3">
              <div className="font-mono text-lcd text-lg font-bold leading-none">{fmtPace(latest.moving_time, latest.distance)}</div>
              <div className="text-muted text-xs mt-1">/500m</div>
            </div>
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
        <div className="bg-card border border-edge rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">🚣</div>
          <div className="font-medium mb-2">Inga pass synkade ännu</div>
          <p className="text-muted text-sm mb-4">Anslut en träningskälla under Profil för att komma igång:</p>
          <div className="flex flex-col gap-2 text-left max-w-xs mx-auto mb-4">
            <div className="bg-bg rounded-xl px-3 py-2.5 text-xs text-muted">
              <span className="text-fg font-medium">1. Concept2</span> — för roddpass, klicka "Anslut Concept2" och logga in
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

      {/* ── Garmin Wellness ───────────────────────────────────────────────────── */}
      {!wellness && latest && (
        <div className="bg-card border border-edge rounded-2xl p-5 text-center">
          <div className="text-2xl mb-2">💓</div>
          <div className="text-sm font-medium mb-1">Ingen hälsodata än</div>
          <p className="text-muted text-xs mb-3">Anslut Garmin under Profil för sömn, puls, steg och Body Battery</p>
          <a href="/dashboard/profil" className="inline-block text-xs text-accent hover:underline">
            Gå till Profil →
          </a>
        </div>
      )}
      {wellness && (
        <div>
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
                    style={{ width: `${Math.min((wellness.steps / 10000) * 100, 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-muted mt-1">{Math.round((wellness.steps / 10000) * 100)}% av 10 000</div>
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
                  <div className="text-[10px] text-lcd mt-1 capitalize">{wellness.hrvStatus.toLowerCase().replace('_', ' ')}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Stats: Vecka / Månad / År ─────────────────────────────────────── */}
      {activities.length > 0 && (
        <div>
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Din statistik</h2>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Denna vecka', data: wk },
              { label: 'Denna månad', data: mm },
              { label: String(y), data: yy },
            ].map(({ label, data }) => (
              <div key={label} className="bg-card border border-edge rounded-2xl p-4">
                <div className="text-xs text-muted mb-3">{label}</div>
                <div className="font-mono text-accent text-xl font-bold leading-none mb-0.5">
                  {fmtKm(data.dist)}
                </div>
                <div className="text-muted text-xs">{data.count} pass</div>
                <div className="text-muted text-xs">{fmtDur(data.time)}</div>
                {data.dist > 0 && (
                  <div className="font-mono text-lcd text-xs mt-2">
                    ⌀ {fmtPace(data.time, data.dist)}/500m
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Sport breakdown — only show if there are multiple types */}
          {(() => {
            const byType = activities.reduce<Record<string, number>>((acc, a) => {
              const t = a.sport_type ?? 'Övrigt'
              acc[t] = (acc[t] ?? 0) + 1
              return acc
            }, {})
            const types = Object.entries(byType).sort((a, b) => b[1] - a[1])
            if (types.length <= 1) return null
            const sportIcon: Record<string, string> = {
              Rowing: '🚣', Run: '🏃', TrailRun: '🏔', Ride: '🚴', VirtualRide: '🚴',
              Walk: '🚶', Hike: '🥾', Swim: '🏊', WeightTraining: '🏋️', Workout: '💪',
              HIIT: '⚡', Yoga: '🧘', Elliptical: '⚙️',
            }
            return (
              <div className="bg-card border border-edge rounded-2xl p-4 mt-2">
                <div className="text-xs text-muted mb-3">Aktivitetstyper all time</div>
                <div className="flex flex-wrap gap-2">
                  {types.map(([type, count]) => (
                    <div key={type} className="flex items-center gap-1.5 bg-bg rounded-lg px-3 py-1.5">
                      <span>{sportIcon[type] ?? '🏅'}</span>
                      <span className="text-xs text-fg">{type}</span>
                      <span className="font-mono text-xs text-accent font-bold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Extra fun stats */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="bg-card border border-edge rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">🚣</span>
              <div>
                <div className="font-mono text-accent text-sm font-bold">{(yy.dist / 1000).toFixed(0)} km</div>
                <div className="text-muted text-xs">totalt {y}</div>
              </div>
            </div>
            <div className="bg-card border border-edge rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">⏱</span>
              <div>
                <div className="font-mono text-accent text-sm font-bold">{fmtDur(yy.time)}</div>
                <div className="text-muted text-xs">på roddmaskinen {y}</div>
              </div>
            </div>
            <div className="bg-card border border-edge rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">📅</span>
              <div>
                <div className="font-mono text-accent text-sm font-bold">{activities.length} pass</div>
                <div className="text-muted text-xs">all time</div>
              </div>
            </div>
            <div className="bg-card border border-edge rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">🏅</span>
              <div>
                <div className="font-mono text-accent text-sm font-bold">{(activities.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000).toFixed(0)} km</div>
                <div className="text-muted text-xs">totalt all time</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Personliga rekord ─────────────────────────────────────────────── */}
      {prs.length > 0 && (
        <div>
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Personliga rekord</h2>
          <div className="bg-card border border-edge rounded-2xl divide-y divide-edge">
            {prs.map(({ label, pr }) => pr && (
              <div key={label} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-muted text-xs mt-0.5">
                    {new Date(pr.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div className="font-mono text-accent text-sm font-bold text-right">
                  {pr.display}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Mål ─────────────────────────────────────────────────────────────── */}
      <div>
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

      {/* ── Kalender ──────────────────────────────────────────────────────────── */}
      {activities.length > 0 && (
        <ActivityCalendar trainedDates={activities.map(a => a.start_date)} />
      )}

      {/* ── Veckoplan ────────────────────────────────────────────────────────── */}
      <WeeklyPlanCard savedPlan={savedPlan} activityCount={activities.length} />

    </div>
  )
}
