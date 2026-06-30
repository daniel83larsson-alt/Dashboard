import { createSupabaseServerClient } from '@/lib/supabase'
import FeedbackDrawer from '@/components/FeedbackDrawer'

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
  return `${Math.floor(p / 60)}:${Math.round(p % 60).toString().padStart(2, '0')}/500m`
}

function fmt_date_long(d: string) {
  return new Date(d).toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long'
  })
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  const { data: latest } = await supabase
    .from('activities')
    .select('*')
    .eq('user_id', user.id)
    .order('start_date', { ascending: false })
    .limit(1)
    .single()

  const { data: recent } = await supabase
    .from('activities')
    .select('id, sport_type, name, distance, moving_time, start_date')
    .eq('user_id', user.id)
    .order('start_date', { ascending: false })
    .limit(8)

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const thisWeek = (recent ?? []).filter(a => new Date(a.start_date) > weekAgo)
  const weekDist = thisWeek.reduce((s, a) => s + (a.distance ?? 0), 0)

  const firstName = (profile?.name ?? user.email ?? 'Daniel').split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 10 ? 'God morgon' : hour < 18 ? 'Hej' : 'God kväll'

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{greeting}, {firstName}</h1>
        <p className="text-muted text-sm mt-1">
          {thisWeek.length > 0
            ? `${thisWeek.length} pass denna veckan · ${fmt_km(weekDist)}`
            : 'Inga pass denna veckan ännu'}
        </p>
      </div>

      {/* Latest activity */}
      {latest ? (
        <div className="bg-card border border-edge rounded-2xl p-5 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs text-muted uppercase tracking-wider mb-1">Senaste pass</div>
              <div className="font-medium text-fg">{latest.name}</div>
              <div className="text-muted text-xs mt-0.5">{fmt_date_long(latest.start_date)}</div>
            </div>
            <span className="text-xs bg-bg text-muted px-2 py-1 rounded-lg capitalize flex-shrink-0 ml-2">
              {latest.sport_type}
            </span>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-bg rounded-xl p-3">
              <div className="font-mono text-accent text-lg font-bold leading-none">{fmt_km(latest.distance)}</div>
              <div className="text-muted text-xs mt-1">Distans</div>
            </div>
            <div className="bg-bg rounded-xl p-3">
              <div className="font-mono text-accent text-lg font-bold leading-none">{fmt_dur(latest.moving_time)}</div>
              <div className="text-muted text-xs mt-1">Tid</div>
            </div>
            <div className="bg-bg rounded-xl p-3">
              <div className="font-mono text-lcd text-lg font-bold leading-none">{fmt_pace(latest.moving_time, latest.distance)}</div>
              <div className="text-muted text-xs mt-1">Snitt</div>
            </div>
          </div>

          {/* HR / watts row */}
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
        <div className="bg-card border border-edge rounded-2xl p-10 mb-6 text-center">
          <div className="text-4xl mb-3">🚣</div>
          <div className="font-medium mb-1">Inga pass synkade ännu</div>
          <div className="text-muted text-sm">
            Anslut Strava eller lägg till ett pass manuellt under Inställningar
          </div>
        </div>
      )}

      {/* Recent activities */}
      {recent && recent.length > 1 && (
        <div>
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Tidigare pass</h2>
          <div className="flex flex-col gap-2">
            {recent.slice(1).map(a => (
              <div key={a.id} className="bg-card border border-edge rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {new Date(a.start_date).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <div className="font-mono text-accent text-sm font-medium">{fmt_km(a.distance)}</div>
                  <div className="text-muted text-xs">{fmt_dur(a.moving_time)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
