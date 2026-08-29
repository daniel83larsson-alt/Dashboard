import { GarminConnect } from 'garmin-connect'
import type { IActivity } from 'garmin-connect/dist/garmin/types/activity'

// Per-user client cache keyed by email
const clientCache = new Map<string, { client: GarminConnect; loginTime: number }>()
const LOGIN_TTL_MS = 55 * 60 * 1000

// Garmin's display name (needed for the daily-calories endpoint below) is
// static per account, so it's cached alongside the login client instead of
// being re-fetched on every one of the ~20 date calls a single sync makes
// (today + yesterday + a backfill batch).
const displayNameCache = new Map<string, string>()

// TEMPORARY mitigation (STATUS.md "Teknisk skuld" has the full writeup) for
// a bug in the vendored garmin-connect library: its HttpClient keeps
// isRefreshing/refreshSubscribers as module-level state instead of
// per-instance, so when two different users' Garmin sessions are both live
// in the same process and one triggers a 401 token refresh while another's
// request is in flight, the second user's request can be handed the FIRST
// user's OAuth2 token — i.e. one user's sync can silently read another
// user's Garmin data. This is exactly the guaranteed scenario every night's
// all-users cron creates (every Garmin sync running in one process at
// once). Serializing all Garmin HTTP work process-wide closes that race by
// construction, at the cost of the cron job running slower as the number of
// Garmin-connected users grows — acceptable short-term, but the real fix is
// patching the library itself (tracked in STATUS.md), which should let this
// lock be removed again.
// Extra: Garmin's login endpoint (sso.garmin.com) sits behind Cloudflare
// rate limiting that trips after just a couple of logins fired back-to-back
// — verified live against real cron runs (only 2 of 6 Garmin users synced,
// two nights running, all four others failing with the same 429; see
// STATUS.md). Serializing alone (above) wasn't enough since the queue was
// still draining as fast as each login resolved — this adds a real gap
// between them. The bigger part of the fix is batching the cron itself
// across multiple invocations (see api/cron/sync-all/route.ts +
// dl-trainer-cron.yml), since Vercel's 60s function cap doesn't leave room
// for many logins spaced seconds apart; this delay is a cheap second layer
// for whenever more than one Garmin user lands in the same batch.
const GARMIN_LOCK_DELAY_MS = 4000
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

let garminLockTail: Promise<void> = Promise.resolve()
export function withGarminLock<T>(fn: () => Promise<T>): Promise<T> {
  const runAfter = garminLockTail.then(fn, fn)
  garminLockTail = runAfter.then(() => undefined, () => undefined).then(() => delay(GARMIN_LOCK_DELAY_MS))
  return runAfter
}

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
    source: 'garmin',
    sport_type: sportType,
    name: a.activityName || `${sportType} ${formatDate(a.startTimeLocal)}`,
    // distance/moving_time/elapsed_time are all NOT NULL columns — a
    // GPS-less activity (e.g. strength training, "Styrka") genuinely has no
    // distance from Garmin, but a falsy-value ternary here was writing
    // `null` for it instead of `0`. Confirmed live: this was the actual
    // cause of a brand-new user's entire first sync silently failing (see
    // STATUS.md) — the write violated the NOT NULL constraint and the
    // upsert's error was swallowed at the time, making it look like success.
    distance: a.distance ? Math.round(a.distance) : 0,
    moving_time: a.movingDuration ? Math.round(a.movingDuration) : (a.duration ? Math.round(a.duration) : 0),
    elapsed_time: a.elapsedDuration ? Math.round(a.elapsedDuration) : 0,
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

// Fields Garmin's actual (unofficial) response includes that the
// garmin-connect package's own types don't declare.
type GarminHRExtra = { restingHeartRate?: number }
type GarminSleepExtra = {
  avgOvernightHrv?: number
  hrvStatus?: string
  bodyBatteryChange?: number
  restingHeartRate?: number
}

export async function fetchGarminRestingHR(email?: string, password?: string, forDate?: Date): Promise<number | null> {
  try {
    const gc = await getGarminClient(email, password)
    const hr = await gc.getHeartRate(forDate ?? new Date())
    return (hr as GarminHRExtra | undefined)?.restingHeartRate ?? null
  } catch {
    return null
  }
}

// Fetch sleep data for a specific "wake-up date". Garmin's own dailySleepData
// endpoint already keys by wake date — requesting date D returns the sleep
// session that ENDED on the morning of D (verified directly against
// Garmin's raw response: date=2026-07-21 returned sleepStartTimestampGMT
// 2026-07-20 22:11 UTC → sleepEndTimestampGMT 2026-07-21 03:50 UTC). No
// day-shift needed — a previous version of this code subtracted a day here
// on the mistaken assumption that Garmin keyed by go-to-bed date, which
// made every wellness entry show the PREVIOUS night's sleep instead of the
// one that had just ended.
export async function fetchGarminSleepFull(email?: string, password?: string, wakeDate?: Date): Promise<SleepSummary | null> {
  try {
    const gc = await getGarminClient(email, password)
    const sleepDate = wakeDate ?? new Date()
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
      hrv: (data as GarminSleepExtra).avgOvernightHrv ?? null,
      hrvStatus: (data as GarminSleepExtra).hrvStatus ?? null,
      bodyBattery: (data as GarminSleepExtra).bodyBatteryChange ?? null,
      restingHR: (data as GarminSleepExtra).restingHeartRate ?? null,
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

export type GarminCalories = { totalCalories: number | null; activeCalories: number | null }

// Garmin's own daily calorie total (BMR + activity, already accounting for
// the day's real movement/heart rate) — not wrapped by the garmin-connect
// package (no typed method exists for it), so it calls Garmin Connect's
// internal usersummary endpoint directly, the same one connect.garmin.com's
// own daily-summary widget uses. Unofficial: shape may drift, hence the
// defensive parsing and null-on-any-failure, same as fetchGarminHrZones below.
export async function fetchGarminCalories(email?: string, password?: string, forDate?: Date): Promise<GarminCalories | null> {
  try {
    const gc = await getGarminClient(email, password)
    if (!email) throw new Error('Garmin email required to cache display name')
    let displayName = displayNameCache.get(email)
    if (!displayName) {
      const profile = await gc.getUserProfile()
      displayName = profile.displayName
      displayNameCache.set(email, displayName)
    }
    const dateString = (forDate ?? new Date()).toISOString().slice(0, 10)
    const data = await gc.get<Record<string, unknown>>(
      `https://connectapi.garmin.com/usersummary-service/usersummary/daily/${displayName}?calendarDate=${dateString}`
    )
    const total = data.totalKilocalories
    const active = data.activeKilocalories
    return {
      totalCalories: typeof total === 'number' ? Math.round(total) : null,
      activeCalories: typeof active === 'number' ? Math.round(active) : null,
    }
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

// VO2max — same unofficial-endpoint approach as fetchGarminHrZones/
// fetchGarminPolyline above. Garmin only returns a real value here for
// devices/plans that actually compute it (some watches never do — the
// caller must handle a null result as "no Garmin value", not an error).
// Queries a 2-week window and returns the most recent day that actually has
// a value, along with the calendar date it refers to, so a stale reading
// is never presented as current.
export async function fetchGarminVo2max(email?: string, password?: string): Promise<{ value: number; date: string } | null> {
  try {
    const gc = await getGarminClient(email, password)
    const until = new Date()
    const from = new Date(until)
    from.setDate(from.getDate() - 14)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const data = await gc.get<unknown>(
      `https://connectapi.garmin.com/metrics-service/metrics/maxmet/daily/${fmt(from)}/${fmt(until)}`
    )
    if (!Array.isArray(data)) return null
    const withValue = data
      .map((d) => d as Record<string, unknown>)
      .map((d) => {
        const generic = d.generic as Record<string, unknown> | undefined
        const value = (generic?.vo2MaxPreciseValue ?? generic?.vo2MaxValue) as number | undefined
        const date = d.calendarDate as string | undefined
        return value && date ? { value, date } : null
      })
      .filter((d): d is { value: number; date: string } => d !== null)
      .sort((a, b) => b.date.localeCompare(a.date))
    return withValue[0] ?? null
  } catch {
    return null
  }
}

// Fetch a full DayWellness snapshot for an arbitrary past date.
export async function fetchGarminDayWellness(
  date: Date,
  email: string,
  password: string,
): Promise<{ restingHR: number | null; sleep: SleepSummary | null; steps: number | null; calories: GarminCalories | null }> {
  const [restingHR, sleep, steps, calories] = await Promise.allSettled([
    fetchGarminRestingHR(email, password, date),
    fetchGarminSleepFull(email, password, date),
    fetchGarminSteps(email, password, date),
    fetchGarminCalories(email, password, date),
  ])
  return {
    restingHR: restingHR.status === 'fulfilled' ? restingHR.value : null,
    sleep: sleep.status === 'fulfilled' ? sleep.value : null,
    steps: steps.status === 'fulfilled' ? steps.value : null,
    calories: calories.status === 'fulfilled' ? calories.value : null,
  }
}
