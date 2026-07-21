import { createSupabaseServerClient } from '@/lib/supabase-server'
import WellnessCharts from '@/components/WellnessChartsLoader'
import HealthInsightCard from '@/components/HealthInsightCard'
import InsightsPanel from '@/components/InsightsPanel'
import ZoneTabs from '@/components/ZoneTabs'
import SportChartsTabs from '@/components/SportChartsTabsLoader'
import TopTabs from '@/components/TopTabs'
import { bestVo2maxEstimate } from '@/lib/vo2max'
import { hrvStatusLabel } from '@/lib/wellness'
import { aggregateZones, zoneCoverageCount } from '@/lib/zones'
import { startOfWeek } from '@/lib/dates'
import { dedupeForStats } from '@/lib/duplicates'
import { sportLabel, sportIcon, usesDistance } from '@/lib/sport'
import { computeAllSportPRs, longestSession, type Activity as RecordActivity } from '@/lib/records'

const VO2MAX_LOOKBACK_DAYS = 90

function fmtKmRekord(m: number) { return (m / 1000).toFixed(1) + ' km' }

function fmtDurRekord(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

type WeekAgg = { weekStart: string; count: number; distance: number }

function biggestWeek(acts: RecordActivity[]): WeekAgg | null {
  const map = new Map<string, WeekAgg>()
  for (const a of acts) {
    const key = startOfWeek(new Date(a.start_date)).toISOString().slice(0, 10)
    const entry = map.get(key) ?? { weekStart: key, count: 0, distance: 0 }
    entry.count += 1
    entry.distance += a.distance || 0
    map.set(key, entry)
  }
  let best: WeekAgg | null = null
  for (const w of map.values()) {
    if (!best || w.count > best.count || (w.count === best.count && w.distance > best.distance)) best = w
  }
  return best
}

type Streak = { days: number; start: string; end: string }

function longestStreak(acts: RecordActivity[]): Streak | null {
  const dayList = [...new Set(acts.map(a => new Date(a.start_date).toISOString().slice(0, 10)))].sort()
  if (!dayList.length) return null

  let bestLen = 1, bestStart = dayList[0], bestEnd = dayList[0]
  let curLen = 1, curStart = dayList[0]
  for (let i = 1; i < dayList.length; i++) {
    const diffDays = Math.round((new Date(dayList[i]).getTime() - new Date(dayList[i - 1]).getTime()) / 86400000)
    if (diffDays === 1) {
      curLen++
    } else {
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; bestEnd = dayList[i - 1] }
      curLen = 1
      curStart = dayList[i]
    }
  }
  if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; bestEnd = dayList[dayList.length - 1] }
  return { days: bestLen, start: bestStart, end: bestEnd }
}

// Merges what used to be three separate pages (Hälsa/Grafer/Insikter) into
// one, behind tabs — they all look at overlapping data (wellness numbers,
// the same numbers as trend charts, AI commentary on the same numbers) and
// even linked to each other before this. Daniel: "röriga menyer, går det
// slå ihop några sidor?" One combined server fetch instead of three
// separate page loads.
export default async function HalsaPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const initialTab = (await searchParams).tab

  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - VO2MAX_LOOKBACK_DAYS * 86400000).toISOString()
  const weekStart = startOfWeek(now)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const zoneQueryStart = weekStart < yearStart ? weekStart : yearStart

  const [
    { data: wellnessRow },
    { data: healthInsightRow },
    { data: insightRow },
    { data: profile },
    { data: recentRuns },
    { count: activityCount },
    { data: zoneRangeActivities },
    { data: chartActivities },
    { data: recordActivities },
  ] = await Promise.all([
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_wellness').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'health_insights').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'insights').single(),
    supabase.from('profiles').select('daily_step_goal, vo2max_value, vo2max_source, vo2max_date').eq('id', user.id).single(),
    supabase.from('activities').select('sport_type, distance, moving_time, start_date')
      .eq('user_id', user.id).in('sport_type', ['Run', 'TrailRun']).gte('start_date', ninetyDaysAgo),
    supabase.from('activities').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('activities').select('start_date, hr_zones:raw_data->hrZones').eq('user_id', user.id).gte('start_date', zoneQueryStart.toISOString()),
    supabase.from('activities').select('start_date, distance, moving_time, average_heartrate, sport_type')
      .eq('user_id', user.id).order('start_date', { ascending: false }).limit(200),
    // Rekord-fliken behöver HELA historiken (all-time PR/streak/största
    // veckan), till skillnad från Grafer-fliken ovan som medvetet begränsar
    // sig till 200 senaste för trendkurvorna — därför en egen, smalare fråga.
    supabase.from('activities').select('id, strava_id, sport_type, distance, moving_time, start_date')
      .eq('user_id', user.id).order('start_date', { ascending: false }),
  ])
  const stepGoal = profile?.daily_step_goal ?? 10000

  const vo2max = profile?.vo2max_source === 'garmin' && profile?.vo2max_value
    ? { value: profile.vo2max_value, source: 'garmin' as const, date: profile.vo2max_date as string }
    : (() => {
        const est = bestVo2maxEstimate(recentRuns ?? [], VO2MAX_LOOKBACK_DAYS)
        return est ? { value: est.vo2max, source: 'estimated' as const, date: est.date } : null
      })()
  const vo2maxDaysOld = vo2max ? Math.floor((now.getTime() - new Date(vo2max.date).getTime()) / 86400000) : null

  const healthInsightRaw = (healthInsightRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const savedHealthInsight = healthInsightRaw ? (() => { try { return JSON.parse(healthInsightRaw) } catch { return null } })() : null

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

  const allZoneRows = zoneRangeActivities ?? []
  const weekRows = allZoneRows.filter(a => a.start_date >= weekStart.toISOString())
  const monthRows = allZoneRows.filter(a => a.start_date >= monthStart.toISOString())
  const yearRows = allZoneRows.filter(a => a.start_date >= yearStart.toISOString())
  const zonePeriods = [
    { key: 'week', label: 'Vecka', zones: aggregateZones(weekRows), analyzed: zoneCoverageCount(weekRows), total: weekRows.length },
    { key: 'month', label: 'Månad', zones: aggregateZones(monthRows), analyzed: zoneCoverageCount(monthRows), total: monthRows.length },
    { key: 'year', label: String(now.getFullYear()), zones: aggregateZones(yearRows), analyzed: zoneCoverageCount(yearRows), total: yearRows.length },
  ]
  const hasAnyZoneData = zonePeriods.some(p => p.zones.length > 0)

  const wellnessPanel = (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <p className="text-muted text-sm">Wellness-data från Garmin · {history.length > 0 ? `senaste ${history.length} dagarna` : 'väntar på data'}</p>
        {updatedAt && (
          <div className="text-right flex-shrink-0">
            <div className="text-[10px] text-muted">Senast synkad</div>
            <div className="text-xs text-fg">{updatedAt.toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        )}
      </div>

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

          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-4">Utveckling över tid</div>
            <WellnessCharts history={history} showSummary={false} />
          </div>

          <HealthInsightCard savedInsight={savedHealthInsight} />
        </>
      )}
    </div>
  )

  const graferPanel = (
    <div>
      <p className="text-muted text-sm mb-4">Trender, pace och volym</p>
      <SportChartsTabs activities={chartActivities ?? []} />
    </div>
  )

  const insikterPanel = (
    <div className="space-y-8">
      <p className="text-muted text-sm">Hela tränarteamet analyserar din träning</p>

      {hasAnyZoneData && (
        <div>
          <h2 className="text-xs text-muted uppercase tracking-wider mb-4">Pulszoner</h2>
          <ZoneTabs periods={zonePeriods} />
        </div>
      )}

      <div>
        <h2 className="text-xs text-muted uppercase tracking-wider mb-4">Tränarteamets analys</h2>
        <InsightsPanel savedInsight={savedInsight} activityCount={activityCount ?? 0} hasWellness={history.length > 0} />
      </div>
    </div>
  )

  const rekordActs: RecordActivity[] = dedupeForStats(recordActivities ?? []) as RecordActivity[]
  const sportPRs = computeAllSportPRs(rekordActs)
  const biggestWeekRecord = biggestWeek(rekordActs)
  const longestSessionRecord = longestSession(rekordActs)
  const streakRecord = longestStreak(rekordActs)

  const rekordYear = now.getFullYear()
  const rekordThisYearActs = rekordActs.filter(a => new Date(a.start_date) >= yearStart)
  const rekordYearDist = rekordThisYearActs.reduce((s, a) => s + (a.distance ?? 0), 0)
  const rekordYearTime = rekordThisYearActs.reduce((s, a) => s + (a.moving_time ?? 0), 0)
  const rekordAllTimeDist = rekordActs.reduce((s, a) => s + (a.distance ?? 0), 0)

  const rekordBySport = rekordActs.reduce<Record<string, { count: number; dist: number; time: number }>>((acc, a) => {
    const t = a.sport_type ?? 'Övrigt'
    if (!acc[t]) acc[t] = { count: 0, dist: 0, time: 0 }
    acc[t].count += 1
    acc[t].dist += a.distance ?? 0
    acc[t].time += a.moving_time ?? 0
    return acc
  }, {})
  const rekordSportBreakdown = Object.entries(rekordBySport).sort((a, b) => b[1].dist - a[1].dist)

  const rekordPanel = rekordActs.length === 0 ? (
    <div className="bg-card border border-edge rounded-2xl p-10 text-center">
      <div className="text-4xl mb-3">🏆</div>
      <div className="font-medium mb-1">Inga pass loggade ännu</div>
      <p className="text-muted text-sm">Rekord dyker upp här så fort du har loggade pass</p>
    </div>
  ) : (
    <div className="space-y-8">
      {(biggestWeekRecord || longestSessionRecord || streakRecord) && (
        <div>
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Andra rekord</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {biggestWeekRecord && (
              <div className="bg-card border border-edge rounded-2xl p-4">
                <div className="font-mono text-accent text-lg font-bold">{biggestWeekRecord.count} pass</div>
                <div className="text-muted text-xs mt-0.5">Största veckan · {fmtKmRekord(biggestWeekRecord.distance)}</div>
                <div className="text-muted text-[11px] mt-1">Veckan som startade {fmtDateShort(biggestWeekRecord.weekStart)}</div>
              </div>
            )}
            {longestSessionRecord && (
              <a href={`/dashboard/passlogg/${longestSessionRecord.id}`} className="bg-card border border-edge rounded-2xl p-4 hover:border-accent/40 transition-colors">
                <div className="font-mono text-accent text-lg font-bold">{fmtDurRekord(longestSessionRecord.moving_time)}</div>
                <div className="text-muted text-xs mt-0.5">
                  Längsta pass · {sportIcon(longestSessionRecord.sport_type)} {sportLabel(longestSessionRecord.sport_type)}
                  {longestSessionRecord.distance > 0 ? ` · ${fmtKmRekord(longestSessionRecord.distance)}` : ''}
                </div>
                <div className="text-muted text-[11px] mt-1">{fmtDateShort(longestSessionRecord.start_date)}</div>
              </a>
            )}
            {streakRecord && (
              <div className="bg-card border border-edge rounded-2xl p-4">
                <div className="font-mono text-accent text-lg font-bold">{streakRecord.days} {streakRecord.days === 1 ? 'dag' : 'dagar'}</div>
                <div className="text-muted text-xs mt-0.5">Längsta streak</div>
                <div className="text-muted text-[11px] mt-1">{fmtDateShort(streakRecord.start)} – {fmtDateShort(streakRecord.end)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {sportPRs.length > 0 && (
        <div>
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Personliga rekord per sport</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {sportPRs.map(({ sport, prs }) => (
              <div key={sport}>
                <div className="text-xs text-muted mb-2 flex items-center gap-1.5">
                  <span>{sportIcon(sport)}</span>
                  <span className="capitalize">{sportLabel(sport)}</span>
                </div>
                <div className="bg-card border border-edge rounded-2xl divide-y divide-edge">
                  {prs.map(({ label, pr }) => (
                    <a
                      key={label}
                      href={`/dashboard/passlogg/${pr.activityId}`}
                      className="px-4 py-3 flex items-center justify-between hover:bg-bg transition-colors"
                    >
                      <div>
                        <div className="text-sm font-medium">{label}</div>
                        <div className="text-muted text-xs mt-0.5">
                          {new Date(pr.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <div className="font-mono text-accent text-sm font-bold text-right">
                        {pr.display}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Totalt</h2>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="bg-card border border-edge rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">🏅</span>
            <div>
              <div className="font-mono text-accent text-sm font-bold">{(rekordYearDist / 1000).toFixed(0)} km</div>
              <div className="text-muted text-xs">totalt {rekordYear}, alla sporter</div>
            </div>
          </div>
          <div className="bg-card border border-edge rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">⏱</span>
            <div>
              <div className="font-mono text-accent text-sm font-bold">{fmtDurRekord(rekordYearTime)}</div>
              <div className="text-muted text-xs">träningstid {rekordYear}</div>
            </div>
          </div>
          <div className="bg-card border border-edge rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <div>
              <div className="font-mono text-accent text-sm font-bold">{rekordActs.length} pass</div>
              <div className="text-muted text-xs">genom tiderna</div>
            </div>
          </div>
          <div className="bg-card border border-edge rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">🏅</span>
            <div>
              <div className="font-mono text-accent text-sm font-bold">{(rekordAllTimeDist / 1000).toFixed(0)} km</div>
              <div className="text-muted text-xs">totalt genom tiderna</div>
            </div>
          </div>
        </div>

        {rekordSportBreakdown.length > 1 && (
          <div className="bg-card border border-edge rounded-2xl p-4">
            <div className="text-xs text-muted mb-3">Sportfördelning genom tiderna</div>
            <div className="flex flex-col gap-2">
              {rekordSportBreakdown.map(([type, s]) => (
                <div key={type} className="flex items-center gap-3 bg-bg rounded-lg px-3 py-2">
                  <span className="text-lg flex-shrink-0">{sportIcon(type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-fg capitalize">{sportLabel(type)}</div>
                    <div className="text-[10px] text-muted">{s.count} pass · {fmtDurRekord(s.time)}</div>
                  </div>
                  {usesDistance(type) && (
                    <span className="font-mono text-xs text-accent font-bold flex-shrink-0">{fmtKmRekord(s.dist)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="p-4 md:p-8 max-w-2xl lg:max-w-5xl w-full mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Hälsa & Insikter</h1>
      </div>
      <TopTabs
        tabs={[
          { key: 'wellness', label: 'Hälsa' },
          { key: 'grafer', label: 'Grafer' },
          { key: 'insikter', label: 'Insikter' },
          { key: 'rekord', label: 'Rekord' },
        ]}
        initial={initialTab && ['wellness', 'grafer', 'insikter', 'rekord'].includes(initialTab) ? initialTab : undefined}
      >
        {{ wellness: wellnessPanel, grafer: graferPanel, insikter: insikterPanel, rekord: rekordPanel }}
      </TopTabs>
    </div>
  )
}
