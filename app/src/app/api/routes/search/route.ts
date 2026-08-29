import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { logApiCall } from '@/lib/log-api-call'

export type ActivityKind = 'hiking' | 'running' | 'cycling'

type OverpassGeomPoint = { lat: number; lon: number }
type OverpassMember = { type: string; ref: number; role: string }
type OverpassElement = {
  type: 'relation' | 'way' | 'node'
  id: number
  tags?: Record<string, string>
  members?: OverpassMember[]
  geometry?: OverpassGeomPoint[]
}

export type RouteResult = {
  id: number
  name: string
  kind: string
  distanceKm: number
  path: [number, number][][]
}

// OpenStreetMap doesn't have a distinct "running route" tag — real-world
// running mostly happens on the same paths as hiking (route=hiking) or
// simple footways, so "Vandring" and "Löpning" intentionally share the same
// underlying data here rather than pretending a separate category exists.
const OVERPASS_FILTERS: Record<ActivityKind, string[]> = {
  hiking: ['relation["route"="hiking"]', 'relation["route"="foot"]'],
  running: ['relation["route"="hiking"]', 'relation["route"="foot"]'],
  cycling: ['relation["route"="bicycle"]', 'relation["route"="mtb"]'],
}

const MAX_RADIUS_M = 30000
const MAX_ROUTES = 40

// Vercel Hobby plan's real hard cap is 60s (same ceiling already used by
// the cron routes) — this was previously capped at an arbitrary 30, which
// is what actually caused most of the "överbelastad" reports (see below).
export const maxDuration = 58

// overpass-api.de load-balances across several backend mirrors; individual
// mirrors intermittently return a bare Apache 406 under load (verified live:
// same query succeeding and failing back-to-back with no change on our end).
// A couple of retries clears this most of the time; maps.mail.ru's public
// Overpass mirror is kept as a fallback and verified to return real data
// (not just an empty/stale result) for the same query.
//
// Real root cause of the frequent "överbelastad" error, found by comparing
// numbers rather than assuming Overpass itself was actually overloaded: our
// own client-side fetch timeout was 8s, while the query below asks Overpass
// for up to 25s to compute ("[timeout:25]") — a completely normal duration
// for a broad hiking/foot relations query over a 10-30km radius, especially
// near cities with dense trail networks. We were aborting our own request
// and reporting "overloaded" before Overpass had even finished a query that
// was working fine. Fixed by giving each attempt enough time to actually
// match the server-side timeout it declares, using the real 60s function
// ceiling above instead of the old made-up 30s one.
const OVERPASS_ENDPOINTS = [
  { url: 'https://overpass-api.de/api/interpreter', attempts: 2, timeoutMs: 22000 },
  { url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', attempts: 1, timeoutMs: 10000 },
]

async function fetchOverpass(query: string): Promise<{ elements: OverpassElement[] } | null> {
  for (const { url, attempts, timeoutMs } of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: query,
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (res.ok) return await res.json() as { elements: OverpassElement[] }
      } catch {
        // network error or timeout — fall through to next attempt/endpoint
      }
    }
  }
  return null
}

function haversine(a: OverpassGeomPoint, b: OverpassGeomPoint) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLon = (b.lon - a.lon) * Math.PI / 180
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  logApiCall(supabase, user.id, 'routes_search')

  const params = request.nextUrl.searchParams
  const lat = parseFloat(params.get('lat') ?? '')
  const lng = parseFloat(params.get('lng') ?? '')
  const radiusM = Math.min(parseInt(params.get('radius') ?? '10000', 10) || 10000, MAX_RADIUS_M)
  const kind = (params.get('kind') ?? 'hiking') as ActivityKind

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: 'Ogiltig plats' }, { status: 400 })
  }
  const filters = OVERPASS_FILTERS[kind]
  if (!filters) return NextResponse.json({ error: 'Ogiltig aktivitetstyp' }, { status: 400 })

  // Two-phase output: relations first (with their member way-refs, no
  // geometry needed there), then recurse down ("(._;>;)") to also emit
  // every member way/node — those get "out geom" so ways carry a ready
  // lat/lon array. Relations and ways are matched back up by id afterward.
  const query = `[out:json][timeout:20];
(
  ${filters.map(f => `${f}(around:${radiusM},${lat},${lng});`).join('\n  ')}
);
out body;
(._;>;);
out geom;`

  try {
    const data = await fetchOverpass(query)
    if (!data) {
      return NextResponse.json({ error: 'OpenStreetMaps söktjänst är tillfälligt överbelastad — försök igen om en liten stund' }, { status: 502 })
    }
    const elements = data.elements ?? []

    const wayGeomById = new Map<number, [number, number][]>()
    const relationsById = new Map<number, OverpassElement>()
    for (const el of elements) {
      if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length > 1) {
        wayGeomById.set(el.id, el.geometry.map(p => [p.lat, p.lon] as [number, number]))
      }
      // Relations appear twice — once from the initial "out body", once
      // again from the recursed "(._;>;) out geom" that pulls in their own
      // members set — a Map naturally collapses that back to one per id.
      if (el.type === 'relation') relationsById.set(el.id, el)
    }

    const routes: RouteResult[] = [...relationsById.values()]
      .map(el => {
        const paths = (el.members ?? [])
          .filter(m => m.type === 'way')
          .map(m => wayGeomById.get(m.ref))
          .filter((p): p is [number, number][] => Array.isArray(p))

        if (!paths.length) return null

        let distanceKm = 0
        for (const path of paths) {
          for (let i = 1; i < path.length; i++) {
            distanceKm += haversine({ lat: path[i - 1][0], lon: path[i - 1][1] }, { lat: path[i][0], lon: path[i][1] })
          }
        }

        const name = el.tags?.name || el.tags?.['name:sv'] || `Namnlös ${kind === 'cycling' ? 'cykelled' : 'led'}`
        return { id: el.id, name, kind: el.tags?.route ?? kind, distanceKm: +distanceKm.toFixed(1), path: paths }
      })
      .filter((r): r is RouteResult => r !== null && r.distanceKm > 0.1)
      .sort((a, b) => b.distanceKm - a.distanceKm)
      .slice(0, MAX_ROUTES)

    return NextResponse.json({ routes })
  } catch (err) {
    console.error('Route search error:', err)
    return NextResponse.json({ error: 'Sökningen misslyckades' }, { status: 500 })
  }
}
