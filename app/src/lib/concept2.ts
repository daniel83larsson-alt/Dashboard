const C2_BASE = 'https://log.concept2.com'
const C2_API = `${C2_BASE}/api`

export function getConcept2AuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.CONCEPT2_CLIENT_ID!,
    response_type: 'code',
    scope: 'results:read',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/concept2/callback`,
    state,
  })
  return `${C2_BASE}/oauth/authorize?${params}`
}

export async function exchangeConcept2Code(code: string) {
  const res = await fetch(`${C2_BASE}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.CONCEPT2_CLIENT_ID!,
      client_secret: process.env.CONCEPT2_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/concept2/callback`,
    }),
  })
  if (!res.ok) throw new Error(`Concept2 token exchange failed: ${res.status}`)
  return res.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
    user_id: number
  }>
}

export async function refreshConcept2Token(refreshToken: string) {
  const res = await fetch(`${C2_BASE}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.CONCEPT2_CLIENT_ID!,
      client_secret: process.env.CONCEPT2_CLIENT_SECRET!,
    }),
  })
  if (!res.ok) throw new Error('Token refresh failed')
  return res.json() as Promise<{ access_token: string; expires_in: number }>
}

export async function fetchConcept2Results(
  accessToken: string,
  userId: number,
  updatedAfter?: string
): Promise<Concept2Result[]> {
  const params = new URLSearchParams({ per_page: '100' })
  if (updatedAfter) params.set('updated_after', updatedAfter)

  const res = await fetch(`${C2_API}/users/${userId}/results?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Concept2 results fetch failed: ${res.status}`)
  const data = await res.json()
  return data.data ?? []
}

// The list endpoint above returns summaries — some results carry full
// interval/split data only on their single-result detail endpoint.
// Fetched on demand (activity detail page), not during bulk sync.
export async function fetchConcept2ResultDetail(
  accessToken: string,
  userId: number,
  resultId: number
): Promise<Concept2Result | null> {
  const res = await fetch(`${C2_API}/users/${userId}/results/${resultId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.data ?? null
}

export type Concept2Result = {
  id: number
  date: string
  timezone: string
  distance: number
  type: string
  time: number
  time_formatted: string
  workout_type: string
  source: string
  weight_class: string
  verified: boolean
  ranked: boolean
  rower_id: number
  pace: number
  stroke_rate?: number
  heart_rate?: { average?: number; ending?: number }
  // Concept2's actual detail-endpoint response nests per-split data under
  // workout.splits — NOT a top-level "split" field. (Confirmed against a
  // real result: the field genuinely doesn't exist at top level, so a
  // previous version of this type that assumed it silently never matched
  // anything real.)
  workout?: {
    splits?: {
      type: string
      distance: number
      time: number
      stroke_rate?: number
      heart_rate?: { min?: number; average?: number; max?: number; ending?: number }
    }[]
  }
  watts?: number
}

export function concept2ResultToActivity(r: Concept2Result, userId: string) {
  return {
    user_id: userId,
    strava_id: r.id * -1,
    source: 'concept2',
    sport_type: 'Rowing',
    name: `Rodd ${formatDate(r.date)}`,
    distance: r.distance,
    moving_time: Math.round(r.time / 10),
    elapsed_time: Math.round(r.time / 10),
    average_speed: r.distance > 0 ? r.distance / (r.time / 10000) : null,
    max_speed: null,
    average_heartrate: r.heart_rate?.average ?? null,
    max_heartrate: r.heart_rate?.ending ?? null,
    average_watts: r.watts ?? null,
    max_watts: null,
    start_date: new Date(r.date).toISOString(),
    description: `Concept2 · ${r.type}`,
    raw_data: r,
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('sv-SE', {
    day: 'numeric', month: 'short'
  })
}
