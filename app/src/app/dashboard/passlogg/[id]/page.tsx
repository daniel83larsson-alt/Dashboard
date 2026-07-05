import { createSupabaseServerClient } from '@/lib/supabase-server'
import Link from 'next/link'
import ActivityMapLoader from '@/components/ActivityMapLoader'
import ActivityEnrichment from '@/components/ActivityEnrichment'
import { sportIcon, sportLabel, fmtSpeedOrPace } from '@/lib/sport'
import { bestMergePartner } from '@/lib/duplicates'
import { REGION_LABELS, Region } from '@/lib/mobility'

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

  const isMobility = activity.sport_type === 'Mobility'
  const isGarmin = !isMobility && activity.strava_id >= 0
  const raw = (activity.raw_data ?? {}) as Record<string, unknown>
  const speedOrPace = fmtSpeedOrPace(activity.sport_type, activity.distance, activity.moving_time)
  const mobilityExercises = isMobility
    ? ((raw.exercises ?? []) as Array<{ id: string; name: string; region: Region; dose: string }>)
    : []

  // Same real-world session can get synced from both Concept2 (erg) and
  // Garmin (wrist HR) — look for the other-source counterpart within a wide
  // window and merge their data instead of showing two half-empty passes.
  // Doesn't apply to manually-logged Mobility passes — there's no second
  // source to merge with, so skip the lookup entirely for those.
  const windowStart = new Date(new Date(activity.start_date).getTime() - 36 * 3600 * 1000)
  const windowEnd = new Date(new Date(activity.start_date).getTime() + 36 * 3600 * 1000)
  const { data: sameDayActivities } = isMobility
    ? { data: [] }
    : await supabase
        .from('activities')
        .select('id, strava_id, start_date, distance, moving_time, sport_type, name, average_heartrate, max_heartrate, description, raw_data')
        .eq('user_id', user.id)
        .eq('sport_type', activity.sport_type)
        .neq('id', activity.id)
        .gte('start_date', windowStart.toISOString())
        .lte('start_date', windowEnd.toISOString())

  const partner = bestMergePartner(activity, sameDayActivities ?? [])
  const partnerIsGarmin = partner ? partner.strava_id >= 0 : false
  const partnerRaw = (partner?.raw_data ?? {}) as Record<string, unknown>

  const garminRaw = isGarmin ? raw : (partner && partnerIsGarmin ? partnerRaw : null)
  const garminExtras = garminRaw
    ? GARMIN_EXTRA_FIELDS
        .map(f => ({ ...f, value: garminRaw[f.key] }))
        .filter(f => isNum(f.value) && f.value !== 0)
    : []

  const rawLat = garminRaw?.startLatitude
  const rawLng = garminRaw?.startLongitude
  const lat: number | null = isNum(rawLat) && rawLat !== 0 ? rawLat : null
  const lng: number | null = isNum(rawLng) && rawLng !== 0 ? rawLng : null
  const hasCoords = lat !== null && lng !== null

  // Concept2 doesn't always have a paired HR strap — fall back to the
  // matched Garmin session's HR when this record doesn't have its own.
  const mergedAvgHr = activity.average_heartrate ?? partner?.average_heartrate ?? null
  const mergedMaxHr = activity.max_heartrate ?? partner?.max_heartrate ?? null

  const garminActivityId = isGarmin ? activity.id : (partner && partnerIsGarmin ? partner.id : undefined)
  const concept2ActivityId = !isGarmin ? activity.id : (partner && !partnerIsGarmin ? partner.id : undefined)

  const sourceLabel = isMobility
    ? 'Rörlighet'
    : partner
      ? 'Concept2 + Garmin'
      : (isGarmin ? 'Garmin' : 'Concept2')

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
            <span className="text-[10px] text-muted">{sourceLabel}</span>
          </div>
        </div>
        {partner && (
          <p className="text-[11px] text-accent mt-2">
            🔗 Sammanslaget med ett {partnerIsGarmin ? 'Garmin' : 'Concept2'}-pass från samma träning — {isGarmin ? 'Concept2 ger exakt distans/tempo/delsträckor från roddmaskinen' : 'Garmin ger pulszoner'} ovanpå det du ser här.
          </p>
        )}
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
          {mergedAvgHr && (
            <div>
              <div className="font-mono text-lcd text-lg lg:text-2xl font-bold leading-none">{Math.round(mergedAvgHr)}</div>
              <div className="text-muted text-xs mt-1">Snitt-HR</div>
            </div>
          )}
          {mergedMaxHr && (
            <div>
              <div className="font-mono text-lcd text-lg lg:text-2xl font-bold leading-none">{Math.round(mergedMaxHr)}</div>
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

        {/* HR zones (Garmin) and/or splits (Concept2), fetched on demand —
            both render together when this pass was merged from two sources */}
        <ActivityEnrichment garminActivityId={garminActivityId} concept2ActivityId={concept2ActivityId} />
      </div>

      {/* Rörlighet: vilka övningar som faktiskt bockades av */}
      {isMobility && mobilityExercises.length > 0 && (
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-3">Genomförda övningar ({mobilityExercises.length})</div>
          <div className="bg-card border border-edge rounded-2xl divide-y divide-edge">
            {mobilityExercises.map(ex => (
              <div key={ex.id} className="px-4 py-2.5 flex items-center gap-3">
                <span className="text-accent">✓</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{ex.name}</div>
                  <div className="text-muted text-xs">{REGION_LABELS[ex.region]} · {ex.dose}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
