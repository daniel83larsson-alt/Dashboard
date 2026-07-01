import { createSupabaseServerClient } from '@/lib/supabase-server'
import WellnessCharts from '@/components/WellnessCharts'
import InsightsSummary from '@/components/InsightsSummary'

export default async function HalsaPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: wellnessRow }, { data: insightRow }, { count: activityCount }] = await Promise.all([
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_wellness').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'insights').single(),
    supabase.from('activities').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const insightRaw = (insightRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const savedInsight = insightRaw ? (() => { try { return JSON.parse(insightRaw) } catch { return null } })() : null

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
    <div className="p-4 md:p-8 max-w-2xl lg:max-w-5xl w-full space-y-6">
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
                      <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min((latest.steps / 10000) * 100, 100)}%` }} />
                    </div>
                    <div className="text-[10px] text-muted mt-1">{Math.round((latest.steps / 10000) * 100)}% av 10 000</div>
                  </div>
                )}
                {latest.hrv != null && (
                  <div className="bg-card border border-edge rounded-xl p-3">
                    <div className="font-mono text-lcd text-2xl font-bold leading-none">{Math.round(latest.hrv)}</div>
                    <div className="text-muted text-xs mt-1">HRV (ms)</div>
                    {latest.hrvStatus && (
                      <div className="text-[10px] text-lcd mt-1 capitalize">{latest.hrvStatus.toLowerCase().replace(/_/g, ' ')}</div>
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

          {/* Trend charts */}
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-4">Trender · {history.length} dagar</div>
            <WellnessCharts history={history} />
          </div>

          {/* Team insights, compact */}
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-3">Teamets bedömning</div>
            <InsightsSummary savedInsight={savedInsight} activityCount={activityCount ?? 0} hasWellness={history.length > 0} />
          </div>
        </>
      )}
    </div>
  )
}
