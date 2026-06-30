import { GarminConnect } from 'garmin-connect'
import type { IActivity } from 'garmin-connect/dist/garmin/types/activity'

let cachedClient: GarminConnect | null = null
let lastLoginTime = 0
const LOGIN_TTL_MS = 55 * 60 * 1000 // re-login after 55 min

export async function getGarminClient(): Promise<GarminConnect> {
  const email = process.env.GARMIN_EMAIL
  const password = process.env.GARMIN_PASSWORD
  if (!email || !password) throw new Error('Garmin credentials not configured')

  const now = Date.now()
  if (cachedClient && now - lastLoginTime < LOGIN_TTL_MS) {
    return cachedClient
  }

  const gc = new GarminConnect({ username: email, password })
  await gc.login()
  cachedClient = gc
  lastLoginTime = now
  return gc
}

export async function fetchGarminActivities(limit = 100): Promise<IActivity[]> {
  const gc = await getGarminClient()
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

export async function fetchGarminRestingHR(): Promise<number | null> {
  try {
    const gc = await getGarminClient()
    const today = new Date()
    const hr = await gc.getHeartRate(today)
    return (hr as any)?.restingHeartRate ?? null
  } catch {
    return null
  }
}

export async function fetchGarminSleep(): Promise<number | null> {
  try {
    const gc = await getGarminClient()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const sleep = await gc.getSleepDuration(yesterday)
    if (!sleep) return null
    return sleep.hours + sleep.minutes / 60
  } catch {
    return null
  }
}
