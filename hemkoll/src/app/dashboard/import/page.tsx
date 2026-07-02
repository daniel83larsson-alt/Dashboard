'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Profile = {
  address: string | null
  build_year: number | null
  living_area_sqm: number | null
  heating_type: string | null
  energy_class: string | null
}

export default function ImportPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const router = useRouter()

  async function importUrl(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    setError('')
    setProfile(null)
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setProfile(data.profile)
        router.refresh()
      } else {
        setError(data.error ?? 'Något gick fel')
      }
    } catch {
      setError('Nätverksfel')
    }
    setLoading(false)
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Importera från länk</h1>
        <p className="text-muted text-sm mt-1">Klistra in en länk till mäklarprospekt eller bostadsannons — en agent läser sidan och plockar ut husdata åt dig</p>
      </div>

      <form onSubmit={importUrl} className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://..."
          type="url"
          required
          className="w-full bg-bg border border-edge rounded-lg px-3 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity self-start"
        >
          {loading ? 'Läser sidan...' : 'Importera'}
        </button>
      </form>

      {error && (
        <div className="mt-4 bg-card border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      {profile && (
        <div className="mt-4 bg-card border border-accent/30 rounded-2xl p-4">
          <div className="text-xs text-accent uppercase tracking-wider mb-3">Sparat till husprofilen</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted text-xs block">Adress</span>{profile.address ?? '—'}</div>
            <div><span className="text-muted text-xs block">Byggår</span>{profile.build_year ?? '—'}</div>
            <div><span className="text-muted text-xs block">Boyta</span>{profile.living_area_sqm ? `${profile.living_area_sqm} m²` : '—'}</div>
            <div><span className="text-muted text-xs block">Uppvärmning</span>{profile.heating_type ?? '—'}</div>
            <div><span className="text-muted text-xs block">Energiklass</span>{profile.energy_class ?? '—'}</div>
          </div>
          <p className="text-muted text-xs mt-3">Fält som visar "—" gick inte att hitta i texten — komplettera manuellt på Översikt om du vill.</p>
        </div>
      )}
    </div>
  )
}
