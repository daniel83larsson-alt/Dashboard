'use client'

import { useState } from 'react'
import RouteMapLoader from '@/components/RouteMapLoader'
import type { ActivityKind, RouteResult } from '@/app/api/routes/search/route'

const ACTIVITIES: { kind: ActivityKind; label: string; icon: string }[] = [
  { kind: 'hiking', label: 'Vandring', icon: '🥾' },
  { kind: 'running', label: 'Löpning', icon: '🏃' },
  { kind: 'cycling', label: 'Cykling', icon: '🚴' },
]

const RADII_KM = [5, 10, 20, 30]

type Location = { lat: number; lng: number; label: string }

export default function RutterPage() {
  const [kind, setKind] = useState<ActivityKind>('hiking')
  const [radiusKm, setRadiusKm] = useState(10)
  const [locationQuery, setLocationQuery] = useState('')
  const [location, setLocation] = useState<Location | null>(null)
  const [locating, setLocating] = useState(false)
  const [routes, setRoutes] = useState<RouteResult[] | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('Din webbläsare stödjer inte platsdelning')
      return
    }
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Min plats' })
        setLocating(false)
      },
      err => {
        const messages: Record<number, string> = {
          1: 'Platsdelning nekad — tillåt platsåtkomst för sidan i din webbläsares inställningar, eller sök på ort istället',
          2: 'Kunde inte fastställa din plats just nu — sök på ort istället',
          3: 'Det tog för lång tid att hämta din plats — försök igen eller sök på ort',
        }
        setError(messages[err.code] ?? 'Kunde inte hämta din plats — sök på ort istället')
        setLocating(false)
      },
      { timeout: 20000, maximumAge: 60000 }
    )
  }

  async function searchPlace(e: React.FormEvent) {
    e.preventDefault()
    if (!locationQuery.trim()) return
    setLocating(true)
    setError('')
    try {
      const res = await fetch(`/api/routes/geocode?q=${encodeURIComponent(locationQuery.trim())}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Hittade ingen plats'); return }
      setLocation({ lat: data.lat, lng: data.lng, label: data.label })
    } catch {
      setError('Nätverksfel')
    } finally {
      setLocating(false)
    }
  }

  async function searchRoutes() {
    if (!location) return
    setLoading(true)
    setError('')
    setSelectedId(null)
    try {
      const params = new URLSearchParams({
        lat: String(location.lat),
        lng: String(location.lng),
        radius: String(radiusKm * 1000),
        kind,
      })
      const res = await fetch(`/api/routes/search?${params}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Sökningen misslyckades'); setRoutes(null); return }
      setRoutes(data.routes)
      if (!data.routes.length) setError('Inga leder hittades i det här området — testa en större radie')
    } catch {
      setError('Nätverksfel')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl lg:max-w-5xl w-full mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Rutter</h1>
        <p className="text-muted text-sm mt-1">
          Hitta vandrings-, löpar- och cykelleder nära en plats — data från OpenStreetMap, gratis och öppet.
        </p>
      </div>

      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-4">
        <div>
          <label className="text-muted text-xs block mb-2">Aktivitet</label>
          <div className="flex gap-2">
            {ACTIVITIES.map(a => (
              <button
                key={a.kind}
                type="button"
                onClick={() => setKind(a.kind)}
                className={`text-sm px-3 py-2 rounded-xl border transition-colors flex items-center gap-1.5 ${
                  kind === a.kind ? 'bg-accent text-bg border-accent font-medium' : 'bg-bg border-edge text-muted hover:border-accent/40'
                }`}
              >
                <span>{a.icon}</span> {a.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-muted text-xs block mb-2">Plats</label>
          <form onSubmit={searchPlace} className="flex gap-2">
            <input
              value={locationQuery}
              onChange={e => setLocationQuery(e.target.value)}
              placeholder="T.ex. Onsala, Göteborg..."
              className="flex-1 bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
            />
            <button
              type="submit"
              disabled={locating || !locationQuery.trim()}
              className="text-sm bg-bg border border-edge px-4 py-2.5 rounded-xl text-fg disabled:opacity-50 hover:border-accent transition-colors"
            >
              Sök plats
            </button>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="text-sm bg-bg border border-edge px-4 py-2.5 rounded-xl text-fg disabled:opacity-50 hover:border-accent transition-colors whitespace-nowrap"
            >
              📍 Min plats
            </button>
          </form>
          {location && <div className="text-lcd text-xs mt-2">Vald plats: {location.label}</div>}
        </div>

        <div>
          <label className="text-muted text-xs block mb-2">Radie</label>
          <div className="flex gap-2">
            {RADII_KM.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRadiusKm(r)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  radiusKm === r ? 'bg-accent text-bg border-accent font-medium' : 'bg-bg border-edge text-muted hover:border-accent/40'
                }`}
              >
                {r} km
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button
          type="button"
          onClick={searchRoutes}
          disabled={!location || loading}
          className="bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {loading ? 'Söker...' : 'Sök leder'}
        </button>
      </div>

      {location && routes && routes.length > 0 && (
        <div className="lg:grid lg:grid-cols-3 lg:gap-6 space-y-4 lg:space-y-0">
          <div className="lg:col-span-2">
            <RouteMapLoader
              center={{ lat: location.lat, lng: location.lng }}
              routes={routes}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
          <div className="bg-card border border-edge rounded-2xl divide-y divide-edge max-h-[420px] overflow-y-auto">
            {routes.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-bg transition-colors ${
                  selectedId === r.id ? 'bg-bg' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm text-fg truncate">{r.name}</div>
                  <div className="text-muted text-[11px] mt-0.5 capitalize">{r.kind}</div>
                </div>
                <div className="font-mono text-accent text-sm font-bold flex-shrink-0 ml-2">{r.distanceKm} km</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
