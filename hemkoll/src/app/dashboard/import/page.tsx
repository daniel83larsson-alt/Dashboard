'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'

type Profile = {
  address: string | null
  build_year: number | null
  living_area_sqm: number | null
  heating_type: string | null
  energy_class: string | null
  raw_extracted?: Record<string, unknown> | null
} | null

type Extracted = {
  address: string | null
  build_year: number | null
  living_area_sqm: number | null
  heating_type: string | null
  energy_class: string | null
}

type ResearchExtracted = {
  plot_area_sqm: number | null
  rooms: number | null
  municipality: string | null
  assessed_value_sek: number | null
  latest_sale_price_sek: number | null
  latest_sale_date: string | null
  build_year: number | null
  energy_class: string | null
  summary: string | null
}

type Mode = 'link' | 'text' | 'document'

const TABS: { mode: Mode; label: string; icon: string }[] = [
  { mode: 'link', label: 'Länk', icon: '🔗' },
  { mode: 'text', label: 'Fritext', icon: '📝' },
  { mode: 'document', label: 'Dokument', icon: '📄' },
]

const FIELDS: { key: keyof Extracted; label: string; format?: (v: unknown) => string }[] = [
  { key: 'address', label: 'Adress' },
  { key: 'build_year', label: 'Byggår' },
  { key: 'living_area_sqm', label: 'Boyta', format: v => `${v} m²` },
  { key: 'heating_type', label: 'Uppvärmning' },
  { key: 'energy_class', label: 'Energiklass' },
]

const RESEARCH_FIELDS: { key: keyof ResearchExtracted; label: string; format?: (v: unknown) => string }[] = [
  { key: 'municipality', label: 'Kommun' },
  { key: 'plot_area_sqm', label: 'Tomtarea', format: v => `${v} m²` },
  { key: 'rooms', label: 'Antal rum' },
  { key: 'build_year', label: 'Byggår' },
  { key: 'energy_class', label: 'Energiklass' },
  { key: 'assessed_value_sek', label: 'Taxeringsvärde', format: v => `${Number(v).toLocaleString('sv-SE')} kr` },
  { key: 'latest_sale_price_sek', label: 'Senaste försäljningspris', format: v => `${Number(v).toLocaleString('sv-SE')} kr` },
  { key: 'latest_sale_date', label: 'Försäljningsdatum' },
]

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function ImportPage() {
  const [mode, setMode] = useState<Mode>('link')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const [extracted, setExtracted] = useState<Extracted | null>(null)
  const [current, setCurrent] = useState<Profile>(null)
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [committing, setCommitting] = useState(false)

  const [researching, setResearching] = useState(false)
  const [researchError, setResearchError] = useState('')
  const [researchExtracted, setResearchExtracted] = useState<ResearchExtracted | null>(null)
  const [researchSources, setResearchSources] = useState<string[]>([])
  const [researchSelected, setResearchSelected] = useState<Record<string, boolean>>({})
  const [researchCommitting, setResearchCommitting] = useState(false)
  const [researchSaved, setResearchSaved] = useState(false)

  useEffect(() => {
    const supabase = createSupabaseClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('hemkoll_house_profile').select('*').eq('user_id', user.id).single()
        .then(({ data }) => setCurrent(data ?? null))
    })
  }, [])

  const canSubmit = mode === 'link' ? url.trim().length > 0 : mode === 'text' ? text.trim().length > 0 : !!file

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || loading) return
    setLoading(true)
    setError('')
    setExtracted(null)
    setSaved(false)

    try {
      let body: Record<string, unknown>
      if (mode === 'link') {
        body = { mode, url: url.trim() }
      } else if (mode === 'text') {
        body = { mode, text: text.trim() }
      } else {
        const fileBase64 = await fileToBase64(file!)
        body = { mode, fileBase64, fileMimeType: file!.type }
      }

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setExtracted(data.extracted)
        setCurrent(data.current)
        setGeo(data.geo)
        setSourceUrl(data.sourceUrl)
        const init: Record<string, boolean> = {}
        for (const f of FIELDS) {
          const val = data.extracted[f.key]
          if (val == null) continue
          const curVal = data.current?.[f.key]
          init[f.key] = curVal == null || curVal === ''
        }
        setSelected(init)
      } else {
        setError(data.error ?? 'Något gick fel')
      }
    } catch {
      setError('Nätverksfel')
    }
    setLoading(false)
  }

  async function commit() {
    if (!extracted) return
    setCommitting(true)
    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCommitting(false); return }

    const payload: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() }
    for (const f of FIELDS) {
      if (selected[f.key] && extracted[f.key] != null) payload[f.key] = extracted[f.key]
    }
    if (selected.address && geo) {
      payload.raw_extracted = { ...(current?.raw_extracted ?? {}), lat: geo.lat, lng: geo.lng }
    }
    if (sourceUrl) payload.source_url = sourceUrl

    const { error: upsertError } = await supabase.from('hemkoll_house_profile').upsert(payload, { onConflict: 'user_id' })
    setCommitting(false)
    if (upsertError) { setError('Kunde inte spara'); return }

    setSaved(true)
    setExtracted(null)
    setUrl('')
    setText('')
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    router.refresh()

    const { data } = await supabase.from('hemkoll_house_profile').select('*').eq('user_id', user.id).single()
    setCurrent(data ?? null)
  }

  async function runResearch() {
    if (!current?.address) return
    setResearching(true)
    setResearchError('')
    setResearchExtracted(null)
    setResearchSaved(false)
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'research' }),
      })
      const data = await res.json()
      if (res.ok) {
        setResearchExtracted(data.extracted)
        setResearchSources(data.sources ?? [])
        const init: Record<string, boolean> = {}
        for (const f of RESEARCH_FIELDS) if (data.extracted[f.key] != null) init[f.key] = true
        setResearchSelected(init)
      } else {
        setResearchError(data.error ?? 'Något gick fel')
      }
    } catch {
      setResearchError('Nätverksfel')
    }
    setResearching(false)
  }

  async function commitResearch() {
    if (!researchExtracted) return
    setResearchCommitting(true)
    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setResearchCommitting(false); return }

    const extra: Record<string, unknown> = {}
    for (const f of RESEARCH_FIELDS) {
      if (researchSelected[f.key] && researchExtracted[f.key] != null) extra[f.key] = researchExtracted[f.key]
    }

    const { error: upsertError } = await supabase.from('hemkoll_house_profile').upsert({
      user_id: user.id,
      raw_extracted: { ...(current?.raw_extracted ?? {}), research: extra },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    setResearchCommitting(false)
    if (upsertError) { setResearchError('Kunde inte spara'); return }
    setResearchSaved(true)
    setResearchExtracted(null)
    router.refresh()
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Importera</h1>
        <p className="text-muted text-sm mt-1">Länk, dokument eller fritext — en agent läser igenom och strukturerar husdata åt dig</p>
      </div>

      <div className="flex gap-1 bg-card border border-edge rounded-xl p-1 mb-4">
        {TABS.map(t => (
          <button
            key={t.mode}
            type="button"
            onClick={() => { setMode(t.mode); setError('') }}
            className={`flex-1 text-sm font-medium px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              mode === t.mode ? 'bg-accent text-bg' : 'text-muted hover:text-fg'
            }`}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        {mode === 'link' && (
          <>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
              type="url"
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent"
            />
            <p className="text-muted text-xs">Klistra in en länk till mäklarprospekt eller bostadsannons</p>
          </>
        )}

        {mode === 'text' && (
          <>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Klistra in text — t.ex. innehåll från ett besiktningsprotokoll, en annons du kopierat, eller bara vad du vet om huset..."
              rows={8}
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent resize-none"
            />
            <p className="text-muted text-xs">Minst några meningar behövs för att AI:n ska hitta något att strukturera</p>
          </>
        )}

        {mode === 'document' && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2.5 text-sm text-fg file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-accent file:text-bg file:text-xs file:font-semibold file:cursor-pointer"
            />
            <p className="text-muted text-xs">PDF, PNG, JPEG eller WebP — t.ex. besiktningsprotokoll eller energideklaration</p>
          </>
        )}

        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity self-start"
        >
          {loading ? 'Läser...' : 'Läs in'}
        </button>
      </form>

      {error && (
        <div className="mt-4 bg-card border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      {saved && !extracted && (
        <div className="mt-4 bg-card border border-accent/30 rounded-xl p-4 text-accent text-sm">✓ Sparat till husprofilen</div>
      )}

      {extracted && (
        <div className="mt-4 bg-card border border-accent/30 rounded-2xl p-4">
          <div className="text-xs text-accent uppercase tracking-wider mb-1">Hittades — välj vad som ska sparas</div>
          <p className="text-muted text-xs mb-3">Sparas inte förrän du väljer fält och trycker Spara. Fält som skulle ersätta något du redan har ifyllt är förbockade som avstängda.</p>
          <div className="divide-y divide-edge">
            {FIELDS.map(f => {
              const newVal = extracted[f.key]
              if (newVal == null) return null
              const curVal = current?.[f.key]
              const changed = curVal != null && String(curVal) !== String(newVal)
              const display = f.format ? f.format(newVal) : String(newVal)
              const curDisplay = curVal != null && f.format ? f.format(curVal) : curVal != null ? String(curVal) : null
              return (
                <label key={f.key} className="flex items-start gap-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!selected[f.key]}
                    onChange={e => setSelected(prev => ({ ...prev, [f.key]: e.target.checked }))}
                    className="mt-1"
                  />
                  <div className="flex-1 text-sm">
                    <div className="text-muted text-xs">{f.label}</div>
                    <div>{display}</div>
                    {changed && <div className="text-xs text-amber-500/80 mt-0.5">Ersätter nuvarande: {curDisplay}</div>}
                  </div>
                </label>
              )
            })}
          </div>
          <button
            onClick={commit}
            disabled={committing || !Object.values(selected).some(Boolean)}
            className="mt-3 bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {committing ? 'Sparar...' : 'Spara valda fält'}
          </button>
        </div>
      )}

      <div className="mt-8 pt-6 border-t border-edge">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🔍</span>
          <h2 className="font-semibold text-sm">Sök mer info om huset</h2>
        </div>
        <p className="text-muted text-xs mb-3">
          {current?.address
            ? `Låter AI:n söka offentligt tillgänglig info om ${current.address} (taxeringsvärde, tomtarea, kommun m.m.) via Google-sökning. Inget sparas automatiskt.`
            : 'Spara en adress ovan först, så kan AI:n söka mer info om huset åt dig.'}
        </p>
        <button
          onClick={runResearch}
          disabled={!current?.address || researching}
          className="bg-card border border-edge text-fg text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-40 hover:border-accent/40 transition-colors"
        >
          {researching ? 'Söker...' : 'Sök mer info'}
        </button>

        {researchError && (
          <div className="mt-3 bg-card border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{researchError}</div>
        )}

        {researchSaved && !researchExtracted && (
          <div className="mt-3 bg-card border border-accent/30 rounded-xl p-4 text-accent text-sm">✓ Extra info sparad</div>
        )}

        {researchExtracted && (
          <div className="mt-3 bg-card border border-accent/30 rounded-2xl p-4">
            <div className="text-xs text-accent uppercase tracking-wider mb-1">Hittades via sökning</div>
            {researchExtracted.summary && <p className="text-sm text-muted mb-3">{researchExtracted.summary}</p>}
            <div className="divide-y divide-edge">
              {RESEARCH_FIELDS.map(f => {
                const val = researchExtracted[f.key]
                if (val == null) return null
                const display = f.format ? f.format(val) : String(val)
                return (
                  <label key={f.key} className="flex items-start gap-3 py-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!researchSelected[f.key]}
                      onChange={e => setResearchSelected(prev => ({ ...prev, [f.key]: e.target.checked }))}
                      className="mt-1"
                    />
                    <div className="flex-1 text-sm">
                      <div className="text-muted text-xs">{f.label}</div>
                      <div>{display}</div>
                    </div>
                  </label>
                )
              })}
            </div>
            {researchSources.length > 0 && (
              <div className="mt-3 text-xs text-muted">
                Källor: {researchSources.slice(0, 4).map((s, i) => (
                  <a key={i} href={s} target="_blank" rel="noreferrer" className="text-accent hover:underline mr-2">{new URL(s).hostname}</a>
                ))}
              </div>
            )}
            <button
              onClick={commitResearch}
              disabled={researchCommitting || !Object.values(researchSelected).some(Boolean)}
              className="mt-3 bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {researchCommitting ? 'Sparar...' : 'Spara vald extra info'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
