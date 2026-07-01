import { createSupabaseServerClient } from '@/lib/supabase-server'
import DuplicateCleanup from '@/components/DuplicateCleanup'
import Link from 'next/link'

function fmt_km(m: number) { return (m / 1000).toFixed(1) + ' km' }
function fmt_dur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}
function fmt_pace(s: number, m: number) {
  if (!m) return '--'
  const p = (s / m) * 500
  return `${Math.floor(p / 60)}:${Math.round(p % 60).toString().padStart(2, '0')}`
}

export default async function PassloggPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: activities } = await supabase
    .from('activities')
    .select('*')
    .eq('user_id', user.id)
    .order('start_date', { ascending: false })

  const totalDist = (activities ?? []).reduce((s, a) => s + (a.distance ?? 0), 0)
  const totalSessions = activities?.length ?? 0

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Passlogg</h1>
        <p className="text-muted text-sm mt-1">
          {totalSessions} pass · {fmt_km(totalDist)} totalt
        </p>
      </div>

      <DuplicateCleanup />

      {!activities?.length ? (
        <div className="bg-card border border-edge rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🚣</div>
          <div className="font-medium mb-1">Inga pass ännu</div>
          <div className="text-muted text-sm">Dina synkade pass visas här</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {activities.map(a => {
            const pace = fmt_pace(a.moving_time, a.distance)
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
                  <span className="text-xs bg-bg text-muted px-2 py-1 rounded-lg capitalize flex-shrink-0 ml-2">
                    {a.sport_type}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <div className="font-mono text-accent text-sm font-bold">{fmt_km(a.distance)}</div>
                    <div className="text-muted text-xs">km</div>
                  </div>
                  <div>
                    <div className="font-mono text-accent text-sm font-bold">{fmt_dur(a.moving_time)}</div>
                    <div className="text-muted text-xs">tid</div>
                  </div>
                  <div>
                    <div className="font-mono text-lcd text-sm font-bold">{pace}</div>
                    <div className="text-muted text-xs">/500m</div>
                  </div>
                  <div>
                    <div className="font-mono text-lcd text-sm font-bold">
                      {a.average_heartrate ? Math.round(a.average_heartrate) : '—'}
                    </div>
                    <div className="text-muted text-xs">HR</div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
