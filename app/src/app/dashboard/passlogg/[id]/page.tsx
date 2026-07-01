import { createSupabaseServerClient } from '@/lib/supabase-server'
import Link from 'next/link'
import ActivityMapLoader from '@/components/ActivityMapLoader'
import ActivityEnrichment from '@/components/ActivityEnrichment'
import { sportIcon, sportLabel, fmtSpeedOrPace } from '@/lib/sport'

function fmtKm(m: number) { return (m / 1000).toFixed(2) + ' km' }
function fmtDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}h ${m}m ${sec}s`
  return `${m}m ${sec}s`
}

// Garmin's raw activity payload has ~100 fields, most null/unknown for any
// given activity. Only surface ones that are actually present as numbers.
const GARMIN_EXTRA_FIELDS: { key: string; label: string; unit?: string; round?: boolean }[] = [
  { key: 'calories', label: 'Kalorier', unit: 'kcal' },
  { key: 'elevationGain', label: 'Höjdökning', unit: 'm' },
  { key: 'elevationLoss', label: 'Höjdminskning', unit: 'm' },
  { key: 'minElevation', label: 'Lägsta höjd', unit: 'm' },
  { key: 'maxElevation', label: 'Högsta höjd', unit: 'm' },
  { key: 'avgPower', label: 'Snittwatt', unit: 'W' },
  { key: 'maxPower', label: 'Maxwatt', unit: 'W' },
  { key: 'normPower', label: 'Normaliserad effekt', unit: 'W' },
  { key: 'averageRunningCadenceInStepsPerMinute', label: 'Snittkadens', unit: 'steg/min', round: true },
  { key: 'maxRunningCadenceInStepsPerMinute', label: 'Maxkadens', unit: 'steg/min', round: true },
  { key: 'averageBikingCadenceInRevPerMinute', label: 'Snittkadens', unit: 'varv/min', round: true },
  { key: 'avgStrideLength', label: 'Steglängd', unit: 'cm' },
  { key: 'vO2MaxValue', label: 'VO2 Max', unit: '' },
  { key: 'aerobicTrainingEffect', label: 'Aerob träningseffekt', unit: '' },
  { key: 'anaerobicTrainingEffect', label: 'Anaerob träningseffekt', unit: '' },
  { key: 'avgVerticalOscillation', label: 'Vertikal oscillation', unit: 'cm' },
  { key: 'avgGroundContactTime', label: 'Marktid', unit: 'ms' },
  { key: 'steps', label: 'Steg', unit: '', round: true },
  { key: 'floorsClimbed', label: 'Klättrade våningar', unit: '', round: true },
  { key: 'minTemperature', label: 'Min temperatur', unit: '°C' },
  { key: 'maxTemperature', label: 'Max temperatur', unit: '°C' },
]

function isNum(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v)
}

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: activity } = await supabase
    .from('activities')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!activity) {
    return (
      <div className="p-4 md:p-8 max-w-2xl w-full mx-auto">
        <Link href="/dashboard/passlogg" className="text-accent text-sm hover:underline">← Tillbaka till Passlogg</Link>
        <div className="bg-card border border-edge rounded-2xl p-10 text-center mt-6">
          <div className="font-medium">Hittade inte passet</div>
        </div>
      </div>
    )
  }

  const isGarmin = activity.strava_id >= 0
  const raw = (activity.raw_data ?? {}) as Record<string, unknown>
  const speedOrPace = fmtSpeedOrPace(activity.sport_type, activity.distance, activity.moving_time)

  const garminExtras = isGarmin
    ? GARMIN_EXTRA_FIELDS
        .map(f => ({ ...f, value: raw[f.key] }))
        .filter(f => isNum(f.value) && f.value !== 0)
    : []

  const rawLat = isGarmin ? raw.startLatitude : undefined
  const rawLng = isGarmin ? raw.startLongitude : undefined
  const lat: number | null = isNum(rawLat) && rawLat !== 0 ? rawLat : null
  const lng: number | null = isNum(rawLng) && rawLng !== 0 ? rawLng : null
  const hasCoords = lat !== null && lng !== null

  return (
    <div className="p-4 md:p-8 max-w-2xl lg:max-w-5xl w-full space-y-5">
      <Link href="/dashboard/passlogg" className="text-accent text-sm hover:underline">← Tillbaka till Passlogg</Link>

      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{activity.name}</h1>
            <p className="text-muted text-sm mt-1">
              {new Date(activity.start_date).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-xs bg-bg text-muted px-2 py-1 rounded-lg flex items-center gap-1">
              <span>{sportIcon(activity.sport_type)}</span>
              <span className="capitalize">{sportLabel(activity.sport_type)}</span>
            </span>
            <span className="text-[10px] text-muted">{isGarmin ? 'Garmin' : 'Concept2'}</span>
          </div>
        </div>
      </div>

      {/* Core stats + HR zones/splits side by side on desktop — on mobile
          this was previously buried far below Map/Garmin extras, leaving
          the page ~80% empty on a wide screen with no focal point. */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start space-y-5 lg:space-y-0">
        <div className="bg-card border border-edge rounded-2xl p-5 grid grid-cols-3 gap-3">
          <div>
            <div className="font-mono text-accent text-lg lg:text-2xl font-bold leading-none">{fmtKm(activity.distance)}</div>
            <div className="text-muted text-xs mt-1">Distans</div>
          </div>
          <div>
            <div className="font-mono text-accent text-lg lg:text-2xl font-bold leading-none">{fmtDur(activity.moving_time)}</div>
            <div className="text-muted text-xs mt-1">Tid</div>
          </div>
          {speedOrPace && (
            <div>
              <div className="font-mono text-lcd text-lg lg:text-2xl font-bold leading-none">{speedOrPace.value}</div>
              <div className="text-muted text-xs mt-1">{speedOrPace.label}</div>
            </div>
          )}
          {activity.average_heartrate && (
            <div>
              <div className="font-mono text-lcd text-lg lg:text-2xl font-bold leading-none">{Math.round(activity.average_heartrate)}</div>
              <div className="text-muted text-xs mt-1">Snitt-HR</div>
            </div>
          )}
          {activity.max_heartrate && (
            <div>
              <div className="font-mono text-lcd text-lg lg:text-2xl font-bold leading-none">{Math.round(activity.max_heartrate)}</div>
              <div className="text-muted text-xs mt-1">Max-HR</div>
            </div>
          )}
          {activity.average_watts != null && (
            <div>
              <div className="font-mono text-lcd text-lg lg:text-2xl font-bold leading-none">{Math.round(activity.average_watts)}W</div>
              <div className="text-muted text-xs mt-1">Snitt-watt</div>
            </div>
          )}
        </div>

        {/* HR zones (Garmin) or splits (Concept2), fetched on demand */}
        <ActivityEnrichment activityId={activity.id} isGarmin={isGarmin} />
      </div>

      {/* Map */}
      {hasCoords && (
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-3">Startplats</div>
          <ActivityMapLoader lat={lat!} lng={lng!} label={activity.name} />
          <p className="text-muted text-[10px] mt-1.5">Visar startpunkt — full GPS-rutt stöds inte ännu</p>
        </div>
      )}

      {/* Garmin extra data */}
      {garminExtras.length > 0 && (
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-3">Detaljerad data</div>
          <div className="bg-card border border-edge rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {garminExtras.map(f => (
              <div key={f.key}>
                <div className="font-mono text-fg text-sm font-bold">
                  {f.round ? Math.round(f.value as number) : (f.value as number).toFixed(1)}{f.unit ? ` ${f.unit}` : ''}
                </div>
                <div className="text-muted text-[11px] mt-0.5">{f.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isGarmin && (!!raw.verified || !!raw.ranked || !!raw.workout_type) && (
        <div className="flex flex-wrap gap-2">
          {!!raw.workout_type && (
            <span className="text-xs bg-bg border border-edge text-muted px-2.5 py-1 rounded-lg capitalize">{String(raw.workout_type)}</span>
          )}
          {!!raw.verified && <span className="text-xs bg-accent/10 border border-accent/30 text-accent px-2.5 py-1 rounded-lg">Verifierat</span>}
          {!!raw.ranked && <span className="text-xs bg-accent/10 border border-accent/30 text-accent px-2.5 py-1 rounded-lg">Rankat</span>}
        </div>
      )}
    </div>
  )
}
