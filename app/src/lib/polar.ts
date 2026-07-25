// Polar AccessLink OAuth + activity sync. Same "connect your own account"
// shape as Concept2/Strava, but Polar's actual data protocol is genuinely
// different and more stateful than either:
//   1. OAuth code exchange (Basic-auth'd token endpoint, not a body secret).
//   2. A one-time "register user" call is REQUIRED after the token exchange
//      — Polar's data endpoints 404 for a token that was never registered,
//      even though the OAuth exchange itself succeeded.
//   3. Exercises aren't listed directly. You open a "transaction" (tells
//      Polar "I'm ready to receive what's new"), fetch each exercise
//      resource the transaction says exists, then COMMIT the transaction —
//      skipping the commit leaves it open and Polar keeps re-offering the
//      same exercises next time instead of only new ones.
// This file has NOT been exercised against a real Polar account (no partner
// credentials existed until Daniel registers one) — the shape below matches
// Polar's documented AccessLink v3 behavior, but this integration carries
// more real risk of a live surprise than the Strava one did. Test for real
// the moment credentials exist, and read any 4xx body Polar sends back
// (`err instanceof Error ? err.message : ...` below is intentionally
// preserved into the cron's error field for exactly that reason).
const POLAR_AUTH_BASE = 'https://flow.polar.com/oauth2'
const POLAR_TOKEN_URL = 'https://polarremote.com/v2/oauth2/token'
const POLAR_API = 'https://www.polaraccesslink.com/v3'

export function getPolarAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.POLAR_CLIENT_ID!,
    response_type: 'code',
    scope: 'accesslink.read_all',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/polar/callback`,
    state,
  })
  return `${POLAR_AUTH_BASE}/authorization?${params}`
}

export async function exchangePolarCode(code: string) {
  const basicAuth = Buffer.from(`${process.env.POLAR_CLIENT_ID}:${process.env.POLAR_CLIENT_SECRET}`).toString('base64')
  const res = await fetch(POLAR_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/polar/callback`,
    }),
  })
  if (!res.ok) throw new Error(`Polar token exchange failed: ${res.status} ${await res.text()}`)
  // Polar tokens don't expire (no refresh flow needed) — x_user_id is
  // Polar's own numeric user id, distinct from the member-id we choose below.
  return res.json() as Promise<{ access_token: string; x_user_id: number }>
}

// Required once per connection before any data endpoint works. member-id is
// OUR identifier for the athlete, not Polar's — the DL Trainer user id is a
// natural fit and guarantees it's unique per Polar account the way
// claim_connected_account already expects.
export async function registerPolarUser(accessToken: string, memberId: string): Promise<void> {
  const res = await fetch(`${POLAR_API}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ 'member-id': memberId }),
  })
  // 409 = already registered (e.g. a re-auth after disconnect/reconnect) —
  // not an error, the registration already exists and works fine.
  if (!res.ok && res.status !== 409) {
    throw new Error(`Polar user registration failed: ${res.status} ${await res.text()}`)
  }
}

type PolarTransaction = { 'transaction-id': number; 'resource-uri': string } | null

// Returns null when Polar has nothing new — a 204 response, not an error.
async function openExerciseTransaction(accessToken: string, polarUserId: number): Promise<PolarTransaction> {
  const res = await fetch(`${POLAR_API}/users/${polarUserId}/exercise-transactions`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`Polar transaction open failed: ${res.status}`)
  return res.json()
}

async function listTransactionExercises(accessToken: string, transactionUri: string): Promise<string[]> {
  const res = await fetch(transactionUri, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 204) return []
  if (!res.ok) throw new Error(`Polar exercise list failed: ${res.status}`)
  const data = await res.json()
  return (data['exercises'] ?? []) as string[]
}

export type PolarExercise = {
  id: string
  'upload-time': string
  'start-time': string // local wall-clock, no timezone suffix
  'start-time-utc-offset': number // minutes
  duration: string // ISO 8601 duration, e.g. "PT1H2M3S"
  calories?: number
  distance?: number // meters
  sport: string
  'heart-rate'?: { average?: number; maximum?: number }
}

async function fetchExercise(accessToken: string, exerciseUri: string): Promise<PolarExercise | null> {
  const res = await fetch(exerciseUri, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  return res.json()
}

async function commitTransaction(accessToken: string, transactionUri: string): Promise<void> {
  const res = await fetch(transactionUri, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  // A failed commit isn't fatal to this sync run (the exercises we already
  // fetched are still saved) — but Polar will re-offer the same exercises
  // next time, which upsert-by-strava_id already handles harmlessly.
  if (!res.ok) console.error(`Polar transaction commit failed: ${res.status}`)
}

// Runs the full open→fetch-each→commit cycle and returns every exercise
// found. A single transaction can be empty (null) — that's the normal
// "nothing new" case, not an error.
export async function fetchPolarExercises(accessToken: string, polarUserId: number): Promise<PolarExercise[]> {
  const tx = await openExerciseTransaction(accessToken, polarUserId)
  if (!tx) return []

  const exerciseUris = await listTransactionExercises(accessToken, tx['resource-uri'])
  const exercises = (await Promise.all(exerciseUris.map(uri => fetchExercise(accessToken, uri))))
    .filter((e): e is PolarExercise => e !== null)

  await commitTransaction(accessToken, tx['resource-uri'])
  return exercises
}

// "PT1H2M3S" → 3723 seconds. Polar always includes hours/minutes/seconds
// components that are present (omits zero ones), never days for a single
// exercise, so this deliberately doesn't handle the "P#D" date part.
export function parseIsoDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/)
  if (!match) return 0
  const [, h, m, s] = match
  return (Number(h ?? 0) * 3600) + (Number(m ?? 0) * 60) + Math.round(Number(s ?? 0))
}

export function mapPolarSport(sport: string): string {
  const key = (sport || '').toLowerCase().replace(/_/g, ' ')
  if (key.includes('trail') && key.includes('run')) return 'TrailRun'
  if (key.includes('run')) return 'Run'
  if (key.includes('mountain bik') || key.includes('road bik') || key.includes('cycl') || key.includes('bik')) return 'Ride'
  if (key.includes('indoor') && (key.includes('bik') || key.includes('cycl'))) return 'VirtualRide'
  if (key.includes('walk')) return 'Walk'
  if (key.includes('hik') || key.includes('trek')) return 'Hike'
  if (key.includes('swim')) return 'Swim'
  if (key.includes('row')) return 'Rowing'
  if (key.includes('strength') || key.includes('weight') || key.includes('gym')) return 'WeightTraining'
  if (key.includes('kettlebell')) return 'Kettlebell'
  if (key.includes('crossfit')) return 'Crossfit'
  if (key.includes('hiit') || key.includes('interval')) return 'HIIT'
  if (key.includes('yoga')) return 'Yoga'
  if (key.includes('pilates')) return 'WeightTraining'
  if (key.includes('cross train') || key.includes('elliptical')) return 'Elliptical'
  if (key.includes('nordic') || key.includes('cross country ski') || key.includes('roller ski')) return 'NordicSki'
  if (key.includes('alpine ski') || key.includes('downhill') || key.includes('snowboard')) return 'AlpineSki'
  return 'Workout'
}

export function polarExerciseToRow(e: PolarExercise, userId: string) {
  const sportType = mapPolarSport(e.sport)
  const movingTime = parseIsoDuration(e.duration)
  // Polar exercise ids are UUID-like strings, not numbers — strava_id needs
  // a bigint, so this hashes the id into a large negative number instead
  // (negative keeps it visually distinct from Garmin's real positive ids
  // even though `source` is the actual ground truth now, not sign).
  const stravaId = -hashToPositiveInt(e.id)
  return {
    user_id: userId,
    strava_id: stravaId,
    source: 'polar',
    sport_type: sportType,
    name: `${sportType} ${formatDate(e['start-time'])}`,
    distance: e.distance ? Math.round(e.distance) : 0,
    moving_time: movingTime,
    elapsed_time: movingTime,
    average_heartrate: e['heart-rate']?.average ?? null,
    max_heartrate: e['heart-rate']?.maximum ?? null,
    calories: e.calories ?? null,
    // start-time has no timezone suffix — it's already the athlete's local
    // wall-clock time, same convention as Garmin/Concept2/Strava rows.
    start_date: new Date(e['start-time']).toISOString(),
    description: `Polar · ${e.sport}`,
    raw_data: e,
  }
}

// Deterministic string→positive-bigint-safe-int hash (FNV-1a), since
// strava_id is a bigint column and Polar's exercise ids are UUID strings,
// not numbers. Collisions are astronomically unlikely for one user's
// exercise count and harmless even if they happened (upsert just overwrites).
function hashToPositiveInt(str: string): number {
  let hash = 2166136261
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  // Keep well under Number.MAX_SAFE_INTEGER after negation elsewhere.
  return Math.abs(hash) % 2147483647
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}
