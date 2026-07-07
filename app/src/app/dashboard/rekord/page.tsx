import { createSupabaseServerClient } from '@/lib/supabase-server'
import { sportLabel, sportIcon } from '@/lib/sport'
import { startOfWeek } from '@/lib/dates'
import { dedupeForStats } from '@/lib/duplicates'
import { computeAllSportPRs, longestSession, type Activity } from '@/lib/records'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtKm(m: number) { return (m / 1000).toFixed(1) + ' km' }

function fmtDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Global (cross-sport) records ────────────────────────────────────────────

type WeekAgg = { weekStart: string; count: number; distance: number }

function biggestWeek(acts: Activity[]): WeekAgg | null {
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

function longestStreak(acts: Activity[]): Streak | null {
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function RekordPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: allActivities } = await supabase
    .from('activities')
    .select('*')
    .eq('user_id', user.id)
    .order('start_date', { ascending: false })

  const activities: Activity[] = dedupeForStats(allActivities ?? []) as Activity[]
  const sportPRs = computeAllSportPRs(activities)
  const week = biggestWeek(activities)
  const longest = longestSession(activities)
  const streak = longestStreak(activities)

  const year = new Date().getFullYear()
  const yearStart = new Date(year, 0, 1)
  const thisYearActs = activities.filter(a => new Date(a.start_date) >= yearStart)
  const yearDist = thisYearActs.reduce((s, a) => s + (a.distance ?? 0), 0)
  const yearTime = thisYearActs.reduce((s, a) => s + (a.moving_time ?? 0), 0)
  const allTimeDist = activities.reduce((s, a) => s + (a.distance ?? 0), 0)

  const bySport = activities.reduce<Record<string, { count: number; dist: number; time: number }>>((acc, a) => {
    const t = a.sport_type ?? 'Övrigt'
    if (!acc[t]) acc[t] = { count: 0, dist: 0, time: 0 }
    acc[t].count += 1
    acc[t].dist += a.distance ?? 0
    acc[t].time += a.moving_time ?? 0
    return acc
  }, {})
  const sportBreakdown = Object.entries(bySport).sort((a, b) => b[1].dist - a[1].dist)

  if (activities.length === 0) {
    return (
      <div className="p-4 md:p-8 max-w-2xl lg:max-w-5xl w-full mx-auto space-y-6">
        <h1 className="text-2xl font-semibold">Rekord</h1>
        <div className="bg-card border border-edge rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🏆</div>
          <div className="font-medium mb-1">Inga pass loggade ännu</div>
          <p className="text-muted text-sm">Rekord dyker upp här så fort du har loggade pass</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl lg:max-w-5xl w-full mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Rekord</h1>

      {/* ── Andra rekord ─────────────────────────────────────────────────────── */}
      {(week || longest || streak) && (
        <div>
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Andra rekord</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {week && (
              <div className="bg-card border border-edge rounded-2xl p-4">
                <div className="font-mono text-accent text-lg font-bold">{week.count} pass</div>
                <div className="text-muted text-xs mt-0.5">Största veckan · {fmtKm(week.distance)}</div>
                <div className="text-muted text-[11px] mt-1">Veckan som startade {fmtDateShort(week.weekStart)}</div>
              </div>
            )}
            {longest && (
              <a href={`/dashboard/passlogg/${longest.id}`} className="bg-card border border-edge rounded-2xl p-4 hover:border-accent/40 transition-colors">
                <div className="font-mono text-accent text-lg font-bold">{fmtDur(longest.moving_time)}</div>
                <div className="text-muted text-xs mt-0.5">
                  Längsta pass · {sportIcon(longest.sport_type)} {sportLabel(longest.sport_type)}
                  {longest.distance > 0 ? ` · ${fmtKm(longest.distance)}` : ''}
                </div>
                <div className="text-muted text-[11px] mt-1">{fmtDateShort(longest.start_date)}</div>
              </a>
            )}
            {streak && (
              <div className="bg-card border border-edge rounded-2xl p-4">
                <div className="font-mono text-accent text-lg font-bold">{streak.days} {streak.days === 1 ? 'dag' : 'dagar'}</div>
                <div className="text-muted text-xs mt-0.5">Längsta streak</div>
                <div className="text-muted text-[11px] mt-1">{fmtDateShort(streak.start)} – {fmtDateShort(streak.end)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Personliga rekord per sport ───────────────────────────────────── */}
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

      {/* ── Totalt & sportfördelning ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Totalt</h2>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="bg-card border border-edge rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">🏅</span>
            <div>
              <div className="font-mono text-accent text-sm font-bold">{(yearDist / 1000).toFixed(0)} km</div>
              <div className="text-muted text-xs">totalt {year}, alla sporter</div>
            </div>
          </div>
          <div className="bg-card border border-edge rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">⏱</span>
            <div>
              <div className="font-mono text-accent text-sm font-bold">{fmtDur(yearTime)}</div>
              <div className="text-muted text-xs">träningstid {year}</div>
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
              <div className="font-mono text-accent text-sm font-bold">{(allTimeDist / 1000).toFixed(0)} km</div>
              <div className="text-muted text-xs">totalt all time</div>
            </div>
          </div>
        </div>

        {sportBreakdown.length > 1 && (
          <div className="bg-card border border-edge rounded-2xl p-4">
            <div className="text-xs text-muted mb-3">Sportfördelning all time</div>
            <div className="flex flex-col gap-2">
              {sportBreakdown.map(([type, s]) => (
                <div key={type} className="flex items-center gap-3 bg-bg rounded-lg px-3 py-2">
                  <span className="text-lg flex-shrink-0">{sportIcon(type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-fg capitalize">{sportLabel(type)}</div>
                    <div className="text-[10px] text-muted">{s.count} pass · {fmtDur(s.time)}</div>
                  </div>
                  <span className="font-mono text-xs text-accent font-bold flex-shrink-0">{fmtKm(s.dist)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
