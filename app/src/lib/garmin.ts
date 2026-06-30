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
  const email = userEmail ?? process.env.GARMIN_EMAIL
  const password = userPassword ?? process.env.GARMIN_PASSWORD
  if (!email || !password) throw new Error('Garmin credentials not configured')
  return getGarminClientForUser(email, password)
}

export async function fetchGarminActivities(limit = 100, email?: string, password?: string): Promise<IActivity[]> {
  const gc = await getGarminClient(email, password)
  return gc.getActivities(0, limit)
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

function mapActivityType(typeKey: string): string {
  const map: Record<string, string> = {
    rowing: 'Rowing',
    indoor_rowing: 'Rowing',
    running: 'Run',
    street_running: 'Run',
    trail_running: 'TrailRun',
    indoor_running: 'Run',
    cycling: 'Ride',
    indoor_cycling: 'VirtualRide',
    walking: 'Walk',
    hiking: 'Hike',
    swimming: 'Swim',
    open_water_swimming: 'Swim',
    strength_training: 'WeightTraining',
    fitness_equipment: 'WeightTraining',
    yoga: 'Yoga',
    elliptical: 'Elliptical',
    indoor_cardio: 'Workout',
    hiit: 'HIIT',
  }
  return map[typeKey] ?? 'Workout'
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

export async function fetchGarminRestingHR(email?: string, password?: string): Promise<number | null> {
  try {
    const gc = await getGarminClient(email, password)
    const today = new Date()
    const hr = await gc.getHeartRate(today)
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

export async function fetchGarminSleepFull(email?: string, password?: string): Promise<SleepSummary | null> {
  try {
    const gc = await getGarminClient(email, password)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const data = await gc.getSleepData(yesterday)
    if (!data?.dailySleepDTO) return null
    const d = data.dailySleepDTO
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

export async function fetchGarminSteps(email?: string, password?: string): Promise<number | null> {
  try {
    const gc = await getGarminClient(email, password)
    const today = new Date()
    const steps = await gc.getSteps(today)
    return typeof steps === 'number' ? steps : null
  } catch {
    return null
  }
}
