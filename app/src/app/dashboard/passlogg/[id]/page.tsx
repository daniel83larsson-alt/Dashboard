import { createSupabaseServerClient } from '@/lib/supabase-server'
import Link from 'next/link'
import ActivityMapLoader from '@/components/ActivityMapLoader'
import ActivityEnrichment from '@/components/ActivityEnrichment'
import FeedbackDrawer from '@/components/FeedbackDrawer'
import { sportIcon, sportLabel, fmtSpeedOrPace, usesDistance } from '@/lib/sport'
import { bestMergePartners, rowSource, type KnownSource } from '@/lib/duplicates'
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
        <Link href="/dashboard/passlogg" className="text-accent text-sm hover:underline">← Tillbaka till Aktiviteter</Link>
        <div className="bg-card border border-edge rounded-2xl p-10 text-center mt-6">
          <div className="font-medium">Hittade inte passet</div>
        </div>
      </div>
    )
  }

  const isMobility = activity.sport_type === 'Mobility'
  const isGarmin = !isMobility && activity.source === 'garmin'
  const raw = (activity.raw_data ?? {}) as Record<string, unknown>
  const speedOrPace = fmtSpeedOrPace(activity.sport_type, activity.distance, activity.moving_time)
  const mobilityExercises = isMobility
    ? ((raw.exercises ?? []) as Array<{ id: string; name: string; region: Region; dose: string }>)
    : []

  // Same real-world session can get synced from more than one source at once
  // — Garmin (wrist HR) + Concept2 (erg) directly, plus Strava if Garmin
  // auto-forwards there, or Polar as a second watch. Look for ALL
  // other-source counterparts within a wide window and merge their data
  // instead of showing several half-empty passes. Doesn't apply to
  // manually-logged Mobility passes — there's no second source to merge
  // with, so skip the lookup entirely for those.
  const windowStart = new Date(new Date(activity.start_date).getTime() - 36 * 3600 * 1000)
  const windowEnd = new Date(new Date(activity.start_date).getTime() + 36 * 3600 * 1000)
  const { data: sameDayActivities } = isMobility
    ? { data: [] }
    : await supabase
        .from('activities')
        .select('id, strava_id, source, start_date, distance, moving_time, sport_type, name, average_heartrate, max_heartrate, description, raw_data')
        .eq('user_id', user.id)
        .eq('sport_type', activity.sport_type)
        .neq('id', activity.id)
        .gte('start_date', windowStart.toISOString())
        .lte('start_date', windowEnd.toISOString())

  const partners = bestMergePartners(activity, sameDayActivities ?? [])
  const garminPartner = partners.find(p => p.source === 'garmin')
  const concept2Partner = partners.find(p => p.source === 'concept2')
  const garminRow = isGarmin ? activity : garminPartner
  const garminRaw = (garminRow?.raw_data ?? null) as Record<string, unknown> | null
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

  // Concept2 doesn't always have a paired HR strap, and Strava/Polar rows
  // sometimes lack it too — fall back to whichever merged partner has it.
  const mergedAvgHr = activity.average_heartrate ?? partners.map(p => p.average_heartrate).find(h => h != null) ?? null
  const mergedMaxHr = activity.max_heartrate ?? partners.map(p => p.max_heartrate).find(h => h != null) ?? null

  const concept2Row = activity.source === 'concept2' ? activity : concept2Partner
  const garminActivityId = garminRow?.id
  const concept2ActivityId = concept2Row?.id

  const SOURCE_LABELS: Record<string, string> = {
    garmin: 'Garmin',
    concept2: 'Concept2',
    strava: 'Strava',
    polar: 'Polar',
    manual: 'Manuellt loggat',
  }
  const SOURCE_ORDER: KnownSource[] = ['concept2', 'garmin', 'strava', 'polar']
  const sourceLabel = isMobility
    ? 'Rörlighet'
    : partners.length > 0
      ? SOURCE_ORDER.filter(s => [activity, ...partners].some(m => rowSource(m) === s)).map(s => SOURCE_LABELS[s]).join(' + ')
      : (SOURCE_LABELS[activity.source] ?? activity.source)
  // Only the partner sources actually add anything beyond what's already
  // named in sourceLabel above — and only Concept2/Garmin have data worth
  // calling out specifically (exact erg distance/pace, HR zones). A Strava
  // or Polar partner is named but gets no fabricated claim of extra data,
  // since it's usually just a mirror of what Garmin already synced.
  const partnerSourceLabel = SOURCE_ORDER.filter(s => partners.some(p => rowSource(p) === s)).map(s => SOURCE_LABELS[s]).join(' + ')
  const partnerDataNotes = [
    concept2Partner ? 'Concept2 ger exakt distans/tempo/delsträckor från roddmaskinen' : null,
    garminPartner ? 'Garmin ger pulszoner' : null,
  ].filter(Boolean).join(', ')

  return (
    <div className="p-4 md:p-8 max-w-2xl lg:max-w-5xl w-full space-y-5">
      <Link href="/dashboard/passlogg" className="text-accent text-sm hover:underline">← Tillbaka till Aktiviteter</Link>

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
        {partners.length > 0 && (
          <p className="text-[11px] text-accent mt-2">
            🔗 Sammanslaget med {partnerSourceLabel} från samma träning{partnerDataNotes ? ` — ${partnerDataNotes}` : ''} ovanpå det du ser här.
          </p>
        )}
      </div>

      {/* Daniel: feedback-knappen fanns tidigare bara för det senaste passet
          på Översikt — men man vill kunna be om feedback på VILKET pass som
          helst i efterhand, inte bara det man råkade logga sist. */}
      {!isMobility && (
        <FeedbackDrawer
          activity={{
            id: activity.id,
            strava_id: activity.strava_id,
            sport_type: activity.sport_type,
            name: activity.name,
            distance: activity.distance,
            moving_time: activity.moving_time,
            average_heartrate: mergedAvgHr,
            max_heartrate: mergedMaxHr,
            average_watts: activity.average_watts,
            start_date: activity.start_date,
          }}
        />
      )}

      {/* Core stats + HR zones/splits side by side on desktop — on mobile
          this was previously buried far below Map/Garmin extras, leaving
          the page ~80% empty on a wide screen with no focal point. */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start space-y-5 lg:space-y-0">
        <div className="bg-card border border-edge rounded-2xl p-5 grid grid-cols-3 gap-3">
          {usesDistance(activity.sport_type) && (
            <div>
              <div className="font-mono text-accent text-lg lg:text-2xl font-bold leading-none">{fmtKm(activity.distance)}</div>
              <div className="text-muted text-xs mt-1">Distans</div>
            </div>
          )}
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
          <ActivityMapLoader lat={lat!} lng={lng!} label={activity.name} activityId={garminActivityId} />
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

      {activity.source === 'concept2' && (!!raw.verified || !!raw.ranked || !!raw.workout_type) && (
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
