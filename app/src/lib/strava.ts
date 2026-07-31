// Strava OAuth + activity sync — deliberately mirrors lib/concept2.ts's
// shape (same auth-url/exchange/refresh/fetch/row-mapper structure) since
// it's the same kind of "connect your own account, we read your results"
// integration, just against a different vendor's API.
const STRAVA_AUTH_BASE = 'https://www.strava.com/oauth'
const STRAVA_API = 'https://www.strava.com/api/v3'

export function getStravaAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    response_type: 'code',
    // activity:read_all (not just activity:read) so activities marked
    // private/followers-only in Strava's own privacy zones still sync —
    // this is the athlete's own data, read on their own behalf.
    scope: 'activity:read_all',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/strava/callback`,
    state,
    approval_prompt: 'auto',
  })
  return `${STRAVA_AUTH_BASE}/authorize?${params}`
}

export async function exchangeStravaCode(code: string) {
  const res = await fetch(`${STRAVA_AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
    }),
  })
  if (!res.ok) throw new Error(`Strava token exchange failed: ${res.status}`)
  return res.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_at: number
    athlete: { id: number }
  }>
}

export async function refreshStravaToken(refreshToken: string) {
  const res = await fetch(`${STRAVA_AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
    }),
  })
  if (!res.ok) throw new Error('Strava token refresh failed')
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_at: number }>
}

export type StravaActivity = {
  id: number
  name: string
  distance: number // meters
  moving_time: number // seconds
  elapsed_time: number
  type: string
  sport_type: string
  start_date: string // ISO, UTC
  start_date_local: string // ISO, athlete's local time — used for display/dedup, matches how Garmin/Concept2 rows store local wall-clock time
  average_speed?: number
  max_speed?: number
  average_heartrate?: number
  max_heartrate?: number
  average_watts?: number
  max_watts?: number
}

// Strava paginates with `after` (unix epoch, activities started after this
// time) + per_page — same "ask for what's new since last sync" shape as
// Concept2's updated_after, just epoch-seconds instead of a date string.
export async function fetchStravaActivities(accessToken: string, after?: number): Promise<StravaActivity[]> {
  const params = new URLSearchParams({ per_page: '100' })
  if (after) params.set('after', String(after))

  const res = await fetch(`${STRAVA_API}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Strava activities fetch failed: ${res.status}`)
  return res.json()
}

export function mapStravaType(sportType: string): string {
  const key = (sportType || '').toLowerCase()
  // Strava's sport_type vocabulary is already close to ours for most
  // endurance sports — this is mostly a rename table, not a fuzzy guess.
  const exact: Record<string, string> = {
    run: 'Run',
    trailrun: 'TrailRun',
    ride: 'Ride',
    mountainbikeride: 'Ride',
    gravelride: 'Ride',
    ebikeride: 'Ride',
    emountainbikeride: 'Ride',
    velomobile: 'Ride',
    virtualride: 'VirtualRide',
    virtualrun: 'Run',
    walk: 'Walk',
    hike: 'Hike',
    swim: 'Swim',
    virtualrow: 'Rowing',
    rowing: 'Rowing',
    weighttraining: 'WeightTraining',
    yoga: 'Yoga',
    pilates: 'WeightTraining',
    elliptical: 'Elliptical',
    stairstepper: 'Elliptical',
    crossfit: 'Crossfit',
    highintensityintervaltraining: 'HIIT',
    nordicski: 'NordicSki',
    rollerski: 'NordicSki',
    backcountryski: 'AlpineSki',
    alpineski: 'AlpineSki',
    snowboard: 'AlpineSki',
    workout: 'Workout',
  }
  if (exact[key]) return exact[key]

  if (key.includes('run')) return 'Run'
  if (key.includes('ride') || key.includes('bik') || key.includes('cycl')) return 'Ride'
  if (key.includes('walk')) return 'Walk'
  if (key.includes('hik')) return 'Hike'
  if (key.includes('swim') || key.includes('row')) return key.includes('row') ? 'Rowing' : 'Swim'
  if (key.includes('weight') || key.includes('strength')) return 'WeightTraining'
  if (key.includes('yoga')) return 'Yoga'
  if (key.includes('ski')) return 'NordicSki'

  return 'Workout'
}

export function stravaActivityToRow(a: StravaActivity, userId: string) {
  const sportType = mapStravaType(a.sport_type || a.type)
  return {
    user_id: userId,
    strava_id: a.id,
    source: 'strava',
    sport_type: sportType,
    name: a.name || `${sportType} ${formatDate(a.start_date_local)}`,
    distance: a.distance ? Math.round(a.distance) : 0,
    moving_time: a.moving_time ?? 0,
    // elapsed_time is a NOT NULL column — see garmin.ts's garminActivityToRow
    // for the real incident this class of bug caused (a null fallback for a
    // NOT NULL numeric column silently failed the whole sync write).
    elapsed_time: a.elapsed_time ?? 0,
    average_speed: a.average_speed ?? null,
    max_speed: a.max_speed ?? null,
    average_heartrate: a.average_heartrate ?? null,
    max_heartrate: a.max_heartrate ?? null,
    average_watts: a.average_watts ?? null,
    max_watts: a.max_watts ?? null,
    start_date: new Date(a.start_date_local).toISOString(),
    description: `Strava · ${a.sport_type || a.type}`,
    raw_data: a,
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}
