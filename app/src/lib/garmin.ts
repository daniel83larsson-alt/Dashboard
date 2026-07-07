import { GarminConnect } from 'garmin-connect'
import type { IActivity } from 'garmin-connect/dist/garmin/types/activity'

// Per-user client cache keyed by email
const clientCache = new Map<string, { client: GarminConnect; loginTime: number }>()
const LOGIN_TTL_MS = 55 * 60 * 1000

export async function getGarminClientForUser(email: string, password: string): Promise<GarminConnect> {
  const now = Date.now()
  const cached = clientCache.get(email)
  if (cached && now - cached.loginTime < LOGIN_TTL_MS) return cached.client

  const gc = new GarminConnect({ username: email, password })
  await gc.login()
  clientCache.set(email, { client: gc, loginTime: now })
  return gc
}

export async function getGarminClient(userEmail?: string, userPassword?: string): Promise<GarminConnect> {
  if (!userEmail || !userPassword) throw new Error('Garmin credentials not configured')
  return getGarminClientForUser(userEmail, userPassword)
}

export async function fetchGarminActivities(limit = 100, email?: string, password?: string, start = 0): Promise<IActivity[]> {
  const gc = await getGarminClient(email, password)
  return gc.getActivities(start, limit)
}

export function garminActivityToRow(a: IActivity, userId: string) {
  const sportType = mapActivityType(a.activityType?.typeKey ?? '')
  return {
    user_id: userId,
    strava_id: a.activityId,
    sport_type: sportType,
    name: a.activityName || `${sportType} ${formatDate(a.startTimeLocal)}`,
    distance: a.distance ? Math.round(a.distance) : null,
    moving_time: a.movingDuration ? Math.round(a.movingDuration) : (a.duration ? Math.round(a.duration) : null),
    elapsed_time: a.elapsedDuration ? Math.round(a.elapsedDuration) : null,
    average_speed: a.averageSpeed ?? null,
    max_speed: a.maxSpeed ?? null,
    average_heartrate: a.averageHR ?? null,
    max_heartrate: a.maxHR ?? null,
    average_watts: null,
    max_watts: null,
    start_date: new Date(a.startTimeLocal).toISOString(),
    description: `Garmin · ${a.activityType?.typeKey ?? 'activity'}`,
    raw_data: a,
  }
}

export function mapActivityType(typeKey: string): string {
  const key = (typeKey || '').toLowerCase()
  const exact: Record<string, string> = {
    rowing: 'Rowing',
    indoor_rowing: 'Rowing',
    running: 'Run',
    street_running: 'Run',
    treadmill_running: 'Run',
    track_running: 'Run',
    indoor_running: 'Run',
    ultra_run: 'Run',
    trail_running: 'TrailRun',
    cycling: 'Ride',
    road_biking: 'Ride',
    mountain_biking: 'Ride',
    gravel_cycling: 'Ride',
    cyclocross: 'Ride',
    cyclocross_cycling: 'Ride',
    track_cycling: 'Ride',
    recumbent_cycling: 'Ride',
    handcycling: 'Ride',
    e_bike_fitness: 'Ride',
    e_bike_mountain: 'Ride',
    virtual_ride: 'VirtualRide',
    indoor_cycling: 'VirtualRide',
    walking: 'Walk',
    casual_walking: 'Walk',
    speed_walking: 'Walk',
    hiking: 'Hike',
    swimming: 'Swim',
    open_water_swimming: 'Swim',
    lap_swimming: 'Swim',
    strength_training: 'WeightTraining',
    fitness_equipment: 'WeightTraining',
    yoga: 'Yoga',
    elliptical: 'Elliptical',
    indoor_cardio: 'Workout',
    hiit: 'HIIT',
  }
  if (exact[key]) return exact[key]

  // Fallback for typeKeys Garmin adds over time that aren't in the exact
  // list above (e-bikes, regional cycling variants, etc.) — matched by
  // substring rather than dumped into the generic 'Workout' bucket.
  if (key.includes('row')) return 'Rowing'
  if (key.includes('trail') && key.includes('run')) return 'TrailRun'
  if (key.includes('run')) return 'Run'
  if (key.includes('cycl') || key.includes('bik')) return key.includes('indoor') || key.includes('virtual') ? 'VirtualRide' : 'Ride'
  if (key.includes('walk')) return 'Walk'
  if (key.includes('hik')) return 'Hike'
  if (key.includes('swim')) return 'Swim'
  if (key.includes('strength') || key.includes('weight')) return 'WeightTraining'
  if (key.includes('yoga')) return 'Yoga'
  if (key.includes('elliptical')) return 'Elliptical'
  if (key.includes('hiit')) return 'HIIT'
  // Downhill/resort/backcountry first (checked before the generic 'ski'
  // catch below) — cross-country, classic, skate, and roller-ski all fall
  // through to NordicSki.
  if (key.includes('resort_ski') || key.includes('backcountry_ski') || key.includes('alpine_ski')) return 'AlpineSki'
  if (key.includes('ski')) return 'NordicSki'

  return 'Workout'
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

export type SleepSummary = {
  hours: number
  deepHours: number
  remHours: number
  lightHours: number
  awakeHours: number
  hrv: number | null
  hrvStatus: string | null
  bodyBattery: number | null
  restingHR: number | null
}

export async function fetchGarminRestingHR(email?: string, password?: string, forDate?: Date): Promise<number | null> {
  try {
    const gc = await getGarminClient(email, password)
    const hr = await gc.getHeartRate(forDate ?? new Date())
    return (hr as any)?.restingHeartRate ?? null
  } catch {
    return null
  }
}

export async function fetchGarminSleep(email?: string, password?: string): Promise<number | null> {
  try {
    const gc = await getGarminClient(email, password)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const sleep = await gc.getSleepDuration(yesterday)
    if (!sleep) return null
    return sleep.hours + sleep.minutes / 60
  } catch {
    return null
  }
}

// Fetch sleep data for a specific "wake-up date". Sleep stored under wellness
// date D is fetched by passing D−1 as the Garmin calendar date (the night
// that ended on the morning of D).
export async function fetchGarminSleepFull(email?: string, password?: string, wakeDate?: Date): Promise<SleepSummary | null> {
  try {
    const gc = await getGarminClient(email, password)
    const base = wakeDate ?? new Date()
    const sleepDate = new Date(base)
    sleepDate.setDate(sleepDate.getDate() - 1)
    const data = await gc.getSleepData(sleepDate)
    if (!data?.dailySleepDTO) return null
    const d = data.dailySleepDTO
    // Garmin returns an empty dailySleepDTO shell (all seconds fields
    // absent/zero) for days with no real recorded sleep — without this
    // guard that reads as "0 hours of sleep" instead of "no data", which
    // silently fills the entire backfill window with fake zero-hour nights.
    if (!d.sleepTimeSeconds) return null
    return {
      hours: (d.sleepTimeSeconds ?? 0) / 3600,
      deepHours: (d.deepSleepSeconds ?? 0) / 3600,
      remHours: (d.remSleepSeconds ?? 0) / 3600,
      lightHours: (d.lightSleepSeconds ?? 0) / 3600,
      awakeHours: (d.awakeSleepSeconds ?? 0) / 3600,
      hrv: (data as any).avgOvernightHrv ?? null,
      hrvStatus: (data as any).hrvStatus ?? null,
      bodyBattery: (data as any).bodyBatteryChange ?? null,
      restingHR: (data as any).restingHeartRate ?? null,
    }
  } catch {
    return null
  }
}

export async function fetchGarminSteps(email?: string, password?: string, forDate?: Date): Promise<number | null> {
  try {
    const gc = await getGarminClient(email, password)
    const steps = await gc.getSteps(forDate ?? new Date())
    return typeof steps === 'number' ? steps : null
  } catch {
    return null
  }
}

export type HrZone = { zoneNumber: number; secsInZone: number; zoneLowBoundary?: number }

// Per-activity heart-rate-zone breakdown. This isn't wrapped by the
// garmin-connect package (no typed method exists for it), so it calls
// Garmin Connect's internal activity-service endpoint directly — the same
// one connect.garmin.com's own web UI uses, reverse-engineered by the
// wider Garmin-API community. Unofficial: shape may drift if Garmin
// changes it, hence the defensive parsing and null-on-any-failure.
export async function fetchGarminHrZones(activityId: number, email: string, password: string): Promise<HrZone[] | null> {
  try {
    const gc = await getGarminClient(email, password)
    const data = await gc.get<unknown>(`https://connectapi.garmin.com/activity-service/activity/${activityId}/hrTimeInZones`)
    if (!Array.isArray(data)) return null
    const zones: HrZone[] = data
      .map((z) => {
        const zone = z as Record<string, unknown>
        return {
          zoneNumber: zone.zoneNumber,
          secsInZone: zone.secsInZone,
          zoneLowBoundary: zone.zoneLowBoundary,
        }
      })
      .filter((z): z is { zoneNumber: number; secsInZone: number; zoneLowBoundary: unknown } =>
        typeof z.zoneNumber === 'number' && typeof z.secsInZone === 'number')
      .map(z => ({
        zoneNumber: z.zoneNumber,
        secsInZone: z.secsInZone,
        zoneLowBoundary: typeof z.zoneLowBoundary === 'number' ? z.zoneLowBoundary : undefined,
      }))
    return zones.length ? zones : null
  } catch {
    return null
  }
}

// Per-activity GPS route. Same unofficial-endpoint approach as
// fetchGarminHrZones above — connect.garmin.com's own web UI calls this
// endpoint for the activity detail map, reverse-engineered by the wider
// Garmin-API community as returning geoPolylineDTO.polyline: [{lat, lon}].
// Unofficial: shape may drift, hence the defensive parsing and
// null-on-any-failure.
export async function fetchGarminPolyline(activityId: number, email: string, password: string): Promise<[number, number][] | null> {
  try {
    const gc = await getGarminClient(email, password)
    const data = await gc.get<unknown>(`https://connectapi.garmin.com/activity-service/activity/${activityId}/details`)
    const dto = (data as Record<string, unknown> | null)?.geoPolylineDTO as Record<string, unknown> | undefined
    const points = dto?.polyline
    if (!Array.isArray(points)) return null
    const coords = points
      .map((p) => {
        const pt = p as Record<string, unknown>
        return [pt.lat, pt.lon] as [unknown, unknown]
      })
      .filter((p): p is [number, number] => typeof p[0] === 'number' && typeof p[1] === 'number')
    return coords.length > 1 ? coords : null
  } catch {
    return null
  }
}

// Fetch a full DayWellness snapshot for an arbitrary past date.
export async function fetchGarminDayWellness(
  date: Date,
  email: string,
  password: string,
): Promise<{ restingHR: number | null; sleep: SleepSummary | null; steps: number | null }> {
  const [restingHR, sleep, steps] = await Promise.allSettled([
    fetchGarminRestingHR(email, password, date),
    fetchGarminSleepFull(email, password, date),
    fetchGarminSteps(email, password, date),
  ])
  return {
    restingHR: restingHR.status === 'fulfilled' ? restingHR.value : null,
    sleep: sleep.status === 'fulfilled' ? sleep.value : null,
    steps: steps.status === 'fulfilled' ? steps.value : null,
  }
}
