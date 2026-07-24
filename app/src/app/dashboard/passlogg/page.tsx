import { createSupabaseServerClient } from '@/lib/supabase-server'
import DuplicateCleanup from '@/components/DuplicateCleanup'
import CopyTrainingLogButton from '@/components/CopyTrainingLogButton'
import Link from 'next/link'
import { sportIcon, sportLabel, fmtSpeedOrPace, usesDistance } from '@/lib/sport'
import { splitMergedPairs, dedupeForStats } from '@/lib/duplicates'
import { relativeDateLabel } from '@/lib/dates'

const PAGE_SIZE = 20

function fmt_km(m: number) { return (m / 1000).toFixed(1) + ' km' }
function fmt_dur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

export default async function PassloggPage({
  searchParams,
}: {
  searchParams: Promise<{ sida?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const page = Math.max(1, parseInt((await searchParams).sida ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const [{ data: activities, count: totalRows }, { data: allForTotals }] = await Promise.all([
    // Den faktiska sidan att visa — narrowed men behåller hr_zones/strava_id
    // som dedupeForStats()/splitMergedPairs() behöver för att slå ihop
    // Concept2+Garmin-par korrekt och inte tappa pulszondata vid ihopslagning.
    // hr_zones hämtas som JSON-path (`hr_zones:raw_data->hrZones`) istället
    // för hela raw_data-kolumnen — det är det enda fältet som faktiskt läses.
    supabase
      .from('activities')
      .select('id, strava_id, sport_type, name, distance, moving_time, average_heartrate, start_date, hr_zones:raw_data->hrZones, description', { count: 'exact' })
      .eq('user_id', user.id)
      .order('start_date', { ascending: false })
      .range(from, to),
    // Rubrikens totalsumma ("X pass · Y km totalt") måste räknas mot HELA
    // historiken för att stämma, inte bara denna sida — men behöver aldrig
    // raw_data (bara vilka rader hör ihop, inte deras pulszondata), så det
    // är en mycket lättare fråga än man kan tro trots att den täcker allt.
    supabase
      .from('activities')
      .select('id, strava_id, sport_type, distance, moving_time, start_date')
      .eq('user_id', user.id),
  ])

  const rows = activities ?? []
  const statRows = dedupeForStats(allForTotals ?? [])
  const totalDist = statRows.reduce((s, a) => s + (a.distance ?? 0), 0)
  const totalSessions = statRows.length
  const totalPages = Math.max(1, Math.ceil((totalRows ?? 0) / PAGE_SIZE))

  // Concept2 + Garmin pairs for the same session become one card (Concept2's
  // precise distance/pace, Garmin's HR as fallback) instead of two — the
  // detail page already does this merge when you open either half. Only
  // pairs within the current page merge — a pair split exactly across a
  // page boundary shows as two unmerged cards, a rare, cosmetic-only edge
  // case not worth the complexity of boundary-aware fetching.
  const { singles, pairs } = splitMergedPairs(rows)
  type Row = typeof rows[number]
  const displayItems: ({ kind: 'single'; a: Row } | { kind: 'merged'; a: Row; partner: Row })[] = [
    ...singles.map(a => ({ kind: 'single' as const, a })),
    ...pairs.map(p => ({ kind: 'merged' as const, a: p.primary, partner: p.partner })),
  ].sort((x, y) => y.a.start_date.localeCompare(x.a.start_date))

  return (
    <div className="p-4 md:p-8 max-w-2xl lg:max-w-5xl w-full mx-auto">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Aktiviteter</h1>
          <p className="text-muted text-sm mt-1">
            {totalSessions} pass · {fmt_km(totalDist)} totalt
          </p>
        </div>
        <Link
          href="/dashboard/logga"
          className="flex-shrink-0 bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
        >
          + Logga pass
        </Link>
      </div>

      <DuplicateCleanup />

      <div className="mb-6">
        <CopyTrainingLogButton />
      </div>

      {!rows.length ? (
        <div className="bg-card border border-edge rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🚣</div>
          <div className="font-medium mb-1">Inga pass ännu</div>
          <div className="text-muted text-sm">Dina synkade pass visas här</div>
        </div>
      ) : (
        <>
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
                      <div className="text-muted text-xs mt-0.5">{relativeDateLabel(a.start_date)}</div>
                    </div>
                    <span className="text-xs bg-bg text-muted px-2 py-1 rounded-lg flex-shrink-0 ml-2 flex items-center gap-1">
                      <span>{sportIcon(a.sport_type)}</span>
                      <span className="capitalize">{item.kind === 'merged' ? `${sportLabel(a.sport_type)} 🔗` : sportLabel(a.sport_type)}</span>
                    </span>
                  </div>

                  <div className={`grid ${usesDistance(a.sport_type) ? 'grid-cols-4' : 'grid-cols-2'} gap-2`}>
                    {usesDistance(a.sport_type) && (
                      <div>
                        <div className="font-mono text-fg text-sm font-bold">{fmt_km(a.distance)}</div>
                        <div className="text-muted text-xs">km</div>
                      </div>
                    )}
                    <div>
                      <div className="font-mono text-fg text-sm font-bold">{fmt_dur(a.moving_time)}</div>
                      <div className="text-muted text-xs">tid</div>
                    </div>
                    {usesDistance(a.sport_type) && (
                      <div>
                        <div className="font-mono text-lcd text-sm font-bold">{speedOrPace?.value ?? '--'}</div>
                        <div className="text-muted text-xs">{speedOrPace?.label ?? '–'}</div>
                      </div>
                    )}
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

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <Link
                href={`/dashboard/passlogg?sida=${page - 1}`}
                aria-disabled={page <= 1}
                className={`text-sm border border-edge px-3 py-1.5 rounded-lg ${page <= 1 ? 'pointer-events-none opacity-30' : 'text-fg hover:border-accent transition-colors'}`}
              >
                ‹ Föregående
              </Link>
              <span className="text-muted text-xs font-mono">Sida {page} av {totalPages}</span>
              <Link
                href={`/dashboard/passlogg?sida=${page + 1}`}
                aria-disabled={page >= totalPages}
                className={`text-sm border border-edge px-3 py-1.5 rounded-lg ${page >= totalPages ? 'pointer-events-none opacity-30' : 'text-fg hover:border-accent transition-colors'}`}
              >
                Nästa ›
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
