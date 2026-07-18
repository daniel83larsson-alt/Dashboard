import { createSupabaseServerClient } from '@/lib/supabase-server'
import WellnessCharts from '@/components/WellnessChartsLoader'
import HealthInsightCard from '@/components/HealthInsightCard'
import { bestVo2maxEstimate } from '@/lib/vo2max'
import { hrvStatusLabel } from '@/lib/wellness'

const VO2MAX_LOOKBACK_DAYS = 90

export default async function HalsaPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - VO2MAX_LOOKBACK_DAYS * 86400000).toISOString()

  const [{ data: wellnessRow }, { data: healthInsightRow }, { data: profile }, { data: recentRuns }] = await Promise.all([
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_wellness').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'health_insights').single(),
    supabase.from('profiles').select('daily_step_goal, vo2max_value, vo2max_source, vo2max_date').eq('id', user.id).single(),
    supabase.from('activities').select('sport_type, distance, moving_time, start_date')
      .eq('user_id', user.id).in('sport_type', ['Run', 'TrailRun']).gte('start_date', ninetyDaysAgo),
  ])
  const stepGoal = profile?.daily_step_goal ?? 10000

  // Prefer Garmin's own already-computed value; fall back to our own
  // estimate from the best qualifying recent run when Garmin doesn't have
  // one (some watches never compute it) — always tagged with its source
  // and the date it refers to, never presented as a single unlabeled number.
  const vo2max = profile?.vo2max_source === 'garmin' && profile?.vo2max_value
    ? { value: profile.vo2max_value, source: 'garmin' as const, date: profile.vo2max_date as string }
    : (() => {
        const est = bestVo2maxEstimate(recentRuns ?? [], VO2MAX_LOOKBACK_DAYS)
        return est ? { value: est.vo2max, source: 'estimated' as const, date: est.date } : null
      })()
  const vo2maxDaysOld = vo2max ? Math.floor((now.getTime() - new Date(vo2max.date).getTime()) / 86400000) : null

  const healthInsightRaw = (healthInsightRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const savedHealthInsight = healthInsightRaw ? (() => { try { return JSON.parse(healthInsightRaw) } catch { return null } })() : null

  const raw = (wellnessRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const store = raw ? (() => { try { return JSON.parse(raw) } catch { return null } })() : null
  const history = store?.history ?? []
  const latest = history[0] ?? null
  const updatedAt = store?.updatedAt ? new Date(store.updatedAt) : null

  const avg = (key: keyof typeof latest, n = 7) => {
    const vals = history.slice(0, n).map((d: typeof latest) => d?.[key]).filter((v: unknown) => v != null) as number[]
    return vals.length ? +(vals.reduce((s: number, v: number) => s + v, 0) / vals.length).toFixed(1) : null
  }

  const avgHR   = avg('restingHR')
  const avgSleep = avg('sleepHours')
  const avgSteps = avg('steps')
  const avgHRV   = avg('hrv')

  return (
    <div className="p-4 md:p-8 max-w-2xl lg:max-w-5xl w-full mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Hälsa</h1>
          <p className="text-muted text-sm mt-1">Wellness-data från Garmin · {history.length > 0 ? `senaste ${history.length} dagarna` : 'väntar på data'}</p>
        </div>
        {updatedAt && (
          <div className="text-right">
            <div className="text-[10px] text-muted">Senast synkad</div>
            <div className="text-xs text-fg">{updatedAt.toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        )}
      </div>

      {/* VO2max — always its own card regardless of Garmin wellness sync,
          since the estimated fallback only needs synced runs, not wellness
          history. Source + date always shown so it's never mistaken for a
          fresher number than it is. */}
      {vo2max && (
        <div className="bg-card border border-edge rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-lcd text-3xl font-bold leading-none">{vo2max.value}</div>
              <div className="text-muted text-xs mt-1">VO2max (ml/kg/min)</div>
            </div>
            <span className={`text-[10px] px-2 py-1 rounded-lg flex-shrink-0 ${vo2max.source === 'garmin' ? 'bg-accent/10 text-accent' : 'bg-bg text-muted'}`}>
              {vo2max.source === 'garmin' ? 'Från Garmin' : 'Eget estimat'}
            </span>
          </div>
          <p className="text-muted text-[11px] mt-2">
            {vo2max.source === 'garmin'
              ? `Uppmätt av din klocka ${new Date(vo2max.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}${vo2maxDaysOld && vo2maxDaysOld > 60 ? ` — ${vo2maxDaysOld} dagar sedan, kan vara inaktuellt` : ''}.`
              : `Uppskattat från ditt bästa löppass ${new Date(vo2max.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} (din klocka räknar inte ut VO2max själv, eller inget Garmin anslutet). Mindre exakt än ett riktigt uppmätt värde.`}
          </p>
        </div>
      )}

      {history.length === 0 ? (
        <div className="bg-card border border-edge rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">💓</div>
          <div className="font-medium mb-1">Ingen hälsodata ännu</div>
          <p className="text-muted text-sm">Synka Garmin under Profil för att börja samla data</p>
        </div>
      ) : (
        <>
          {/* 7-day averages */}
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-3">7-dagarssnitt</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {avgHR && (
                <div className="bg-card border border-edge rounded-xl p-3">
                  <div className="font-mono text-lcd text-xl font-bold">{avgHR}</div>
                  <div className="text-muted text-xs mt-0.5">Vilopuls snitt</div>
                </div>
              )}
              {avgSleep && (
                <div className="bg-card border border-edge rounded-xl p-3">
                  <div className="font-mono text-accent text-xl font-bold">{avgSleep}h</div>
                  <div className="text-muted text-xs mt-0.5">Sömn snitt</div>
                </div>
              )}
              {avgSteps && (
                <div className="bg-card border border-edge rounded-xl p-3">
                  <div className="font-mono text-accent text-xl font-bold">{Math.round(avgSteps / 1000)}k</div>
                  <div className="text-muted text-xs mt-0.5">Steg snitt</div>
                </div>
              )}
              {avgHRV && (
                <div className="bg-card border border-edge rounded-xl p-3">
                  <div className="font-mono text-lcd text-xl font-bold">{avgHRV}</div>
                  <div className="text-muted text-xs mt-0.5">HRV snitt</div>
                </div>
              )}
            </div>
          </div>

          {/* Latest values */}
          {latest && (
            <div>
              <div className="text-xs text-muted uppercase tracking-wider mb-3">
                Senaste dag · {latest.date}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {latest.restingHR && (
                  <div className="bg-card border border-edge rounded-xl p-3">
                    <div className="font-mono text-lcd text-2xl font-bold leading-none">{latest.restingHR}</div>
                    <div className="text-muted text-xs mt-1">Vilopuls (bpm)</div>
                  </div>
                )}
                {latest.sleepHours != null && latest.sleepHours > 0 && (
                  <div className="bg-card border border-edge rounded-xl p-3">
                    <div className="font-mono text-accent text-2xl font-bold leading-none">{latest.sleepHours.toFixed(1)}h</div>
                    <div className="text-muted text-xs mt-1">Sömn</div>
                    {latest.deepSleepHours != null && latest.remSleepHours != null && (
                      <>
                        <div className="mt-2 flex h-2 rounded-full overflow-hidden gap-px">
                          <div className="bg-accent/90 rounded-l" style={{ width: `${(latest.deepSleepHours / latest.sleepHours) * 100}%` }} />
                          <div className="bg-lcd/70" style={{ width: `${(latest.remSleepHours / latest.sleepHours) * 100}%` }} />
                          <div className="bg-edge flex-1 rounded-r" />
                        </div>
                        <div className="flex gap-2 mt-1 text-[10px] text-muted">
                          <span><span className="text-accent">▪</span> Djup {latest.deepSleepHours.toFixed(1)}h</span>
                          <span><span className="text-lcd">▪</span> REM {latest.remSleepHours.toFixed(1)}h</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
                {latest.steps != null && latest.steps > 0 && (
                  <div className="bg-card border border-edge rounded-xl p-3">
                    <div className="font-mono text-accent text-2xl font-bold leading-none">{latest.steps.toLocaleString('sv-SE')}</div>
                    <div className="text-muted text-xs mt-1">Steg</div>
                    <div className="mt-2 h-1.5 bg-bg rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min((latest.steps / stepGoal) * 100, 100)}%` }} />
                    </div>
                    <div className="text-[10px] text-muted mt-1">{Math.round((latest.steps / stepGoal) * 100)}% av {stepGoal.toLocaleString('sv-SE')}</div>
                  </div>
                )}
                {latest.hrv != null && (
                  <div className="bg-card border border-edge rounded-xl p-3">
                    <div className="font-mono text-lcd text-2xl font-bold leading-none">{Math.round(latest.hrv)}</div>
                    <div className="text-muted text-xs mt-1">HRV (ms)</div>
                    {latest.hrvStatus && (
                      <div className="text-[10px] text-lcd mt-1">{hrvStatusLabel(latest.hrvStatus)}</div>
                    )}
                  </div>
                )}
                {latest.bodyBattery != null && (
                  <div className="bg-card border border-edge rounded-xl p-3">
                    <div className={`font-mono text-2xl font-bold leading-none ${latest.bodyBattery >= 0 ? 'text-accent' : 'text-red-400'}`}>
                      {latest.bodyBattery >= 0 ? '+' : ''}{latest.bodyBattery}
                    </div>
                    <div className="text-muted text-xs mt-1">Body Battery (natt)</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Trend charts — summary tiles omitted, "Senaste dag" above already covers today's values */}
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-4">Utveckling över tid</div>
            <WellnessCharts history={history} showSummary={false} />
          </div>

          {/* Team insights, health-data only */}
          <HealthInsightCard savedInsight={savedHealthInsight} />
        </>
      )}
    </div>
  )
}
