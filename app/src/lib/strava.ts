export const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize'
export const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
export const STRAVA_API_BASE = 'https://www.strava.com/api/v3'

export const STRAVA_SPORT_LABELS: Record<string, string> = {
  Rowing: 'Rodd',
  Run: 'Löpning',
  Ride: 'Cykling',
  Swim: 'Simning',
  WeightTraining: 'Styrketräning',
  Yoga: 'Yoga',
  Walk: 'Promenad',
  Hike: 'Vandring',
  VirtualRide: 'Indoor cykling',
  VirtualRun: 'Löpband',
}

export function getStravaAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/strava`,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    state,
  })
  return `${STRAVA_AUTH_URL}?${params}`
}

export async function exchangeStravaCode(code: string) {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error('Strava token exchange failed')
  return res.json()
}

export async function refreshStravaToken(refreshToken: string) {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error('Strava token refresh failed')
  return res.json()
}

export async function fetchStravaActivities(
  accessToken: string,
  page = 1,
  perPage = 50
) {
  const sixMonthsAgo = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 180
  const res = await fetch(
    `${STRAVA_API_BASE}/athlete/activities?after=${sixMonthsAgo}&page=${page}&per_page=${perPage}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error('Failed to fetch Strava activities')
  return res.json()
}

export async function fetchStravaAthlete(accessToken: string) {
  const res = await fetch(`${STRAVA_API_BASE}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch Strava athlete')
  return res.json()
}

export function detectSportsFromActivities(
  activities: Array<{ sport_type: string }>
): string[] {
  const counts: Record<string, number> = {}
  for (const a of activities) {
    counts[a.sport_type] = (counts[a.sport_type] || 0) + 1
  }
  return Object.entries(counts)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .map(([sport]) => sport)
}
