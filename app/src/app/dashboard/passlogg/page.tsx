import { createSupabaseServerClient } from '@/lib/supabase-server'
import DuplicateCleanup from '@/components/DuplicateCleanup'
import Link from 'next/link'
import { sportIcon, sportLabel, fmtSpeedOrPace } from '@/lib/sport'
import { splitMergedPairs, dedupeForStats } from '@/lib/duplicates'

function fmt_km(m: number) { return (m / 1000).toFixed(1) + ' km' }
function fmt_dur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

export default async function PassloggPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Narrowed from select('*') — same reasoning as the dashboard page: this
  // fetches every activity ever logged, so unused columns aren't free.
  // raw_data/strava_id stay for dedupeForStats()/splitMergedPairs().
  const { data: activities } = await supabase
    .from('activities')
    .select('id, strava_id, sport_type, name, distance, moving_time, average_heartrate, start_date, raw_data, description')
    .eq('user_id', user.id)
    .order('start_date', { ascending: false })

  const rows = activities ?? []
  // Same real session synced from both Concept2 and Garmin counts once, not
  // twice, in the headline totals.
  const statRows = dedupeForStats(rows)
  const totalDist = statRows.reduce((s, a) => s + (a.distance ?? 0), 0)
  const totalSessions = statRows.length

  // Concept2 + Garmin pairs for the same session become one card (Concept2's
  // precise distance/pace, Garmin's HR as fallback) instead of two — the
  // detail page already does this merge when you open either half.
  const { singles, pairs } = splitMergedPairs(rows)
  type Row = typeof rows[number]
  const displayItems: ({ kind: 'single'; a: Row } | { kind: 'merged'; a: Row; partner: Row })[] = [
    ...singles.map(a => ({ kind: 'single' as const, a })),
    ...pairs.map(p => ({ kind: 'merged' as const, a: p.primary, partner: p.partner })),
  ].sort((x, y) => y.a.start_date.localeCompare(x.a.start_date))

  return (
    <div className="p-4 md:p-8 max-w-2xl lg:max-w-5xl w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Passlogg</h1>
        <p className="text-muted text-sm mt-1">
          {totalSessions} pass · {fmt_km(totalDist)} totalt
        </p>
      </div>

      <DuplicateCleanup />

      {!rows.length ? (
        <div className="bg-card border border-edge rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🚣</div>
          <div className="font-medium mb-1">Inga pass ännu</div>
          <div className="text-muted text-sm">Dina synkade pass visas här</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {displayItems.map(item => {
            const { a } = item
            const speedOrPace = fmtSpeedOrPace(a.sport_type, a.distance, a.moving_time)
            const hr = a.average_heartrate ?? (item.kind === 'merged' ? item.partner.average_heartrate : null)
            return (
              <Link key={a.id} href={`/dashboard/passlogg/${a.id}`} className="bg-card border border-edge rounded-xl p-4 block hover:border-accent/40 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-medium text-sm">{a.name}</div>
                    <div className="text-muted text-xs mt-0.5">
                      {new Date(a.start_date).toLocaleDateString('sv-SE', {
                        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </div>
                  </div>
                  <span className="text-xs bg-bg text-muted px-2 py-1 rounded-lg flex-shrink-0 ml-2 flex items-center gap-1">
                    <span>{sportIcon(a.sport_type)}</span>
                    <span className="capitalize">{item.kind === 'merged' ? `${sportLabel(a.sport_type)} 🔗` : sportLabel(a.sport_type)}</span>
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <div className="font-mono text-fg text-sm font-bold">{fmt_km(a.distance)}</div>
                    <div className="text-muted text-xs">km</div>
                  </div>
                  <div>
                    <div className="font-mono text-fg text-sm font-bold">{fmt_dur(a.moving_time)}</div>
                    <div className="text-muted text-xs">tid</div>
                  </div>
                  <div>
                    <div className="font-mono text-lcd text-sm font-bold">{speedOrPace?.value ?? '--'}</div>
                    <div className="text-muted text-xs">{speedOrPace?.label ?? '–'}</div>
                  </div>
                  <div>
                    <div className="font-mono text-lcd text-sm font-bold">
                      {hr ? Math.round(hr) : '—'}
                    </div>
                    <div className="text-muted text-xs">HR</div>
                  </div>
                </div>
                {item.kind === 'merged' && (
                  <div className="text-[10px] text-accent mt-2">Concept2 + Garmin ihopslaget</div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
