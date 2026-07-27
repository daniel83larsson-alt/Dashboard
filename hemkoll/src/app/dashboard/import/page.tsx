'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'

type HeatingSystem = { type: string | null; role: string | null; installed_year: number | null; notes: string | null }
type OngoingProject = { title: string | null; goal: string | null; estimated_cost_sek: number | null; expected_savings_sek: number | null; notes: string | null }
type SolarPv = { capacity_kw: number | null; production_kwh_last_year: number | null; consumption_kwh_last_year: number | null; self_sufficiency_pct: number | null }
type EvCharging = { annual_kwh: number | null; charger: string | null }
type OperatingCost = {
  heating: number | null; electricity: number | null; water_sewage: number | null; waste: number | null
  insurance: number | null; chimney_sweep: number | null; community_fee: number | null; other: number | null
  total: number | null
}

type Profile = {
  address: string | null
  build_year: number | null
  living_area_sqm: number | null
  basement_area_sqm: number | null
  plot_area_sqm: number | null
  rooms: number | null
  building_type: string | null
  heating_type: string | null
  energy_class: string | null
  energy_performance_kwh_sqm: number | null
  purchase_price_sek: number | null
  purchase_year: number | null
  assessed_value_sek: number | null
  operating_cost_sek: OperatingCost | null
  smart_home_platform: string | null
  heating_systems: HeatingSystem[] | null
  raw_extracted?: Record<string, unknown> | null
} | null

type Extracted = {
  address: string | null
  build_year: number | null
  living_area_sqm: number | null
  basement_area_sqm: number | null
  plot_area_sqm: number | null
  rooms: number | null
  building_type: string | null
  heating_type: string | null
  energy_class: string | null
  energy_performance_kwh_sqm: number | null
  purchase_price_sek: number | null
  purchase_year: number | null
  assessed_value_sek: number | null
  operating_cost_sek: OperatingCost | null
  smart_home_platform: string | null
  heating_systems: HeatingSystem[] | null
  solar_pv: SolarPv | null
  ev_charging: EvCharging | null
  renovations: string[] | null
  ongoing_projects: OngoingProject[] | null
  strategy_notes: string | null
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

const sek = (v: unknown) => `${Number(v).toLocaleString('sv-SE')} kr`

const OPERATING_COST_LABELS: Record<keyof OperatingCost, string> = {
  heating: 'Värme', electricity: 'El', water_sewage: 'Vatten/avlopp', waste: 'Sophämtning',
  insurance: 'Försäkring', chimney_sweep: 'Sotning', community_fee: 'Samfällighet/väg', other: 'Övrigt',
  total: 'Totalt',
}

const FIELDS: { key: keyof Extracted; label: string; format?: (v: unknown) => string }[] = [
  { key: 'address', label: 'Adress' },
  { key: 'build_year', label: 'Byggår' },
  { key: 'building_type', label: 'Bostadstyp' },
  { key: 'living_area_sqm', label: 'Boyta', format: v => `${v} m²` },
  { key: 'basement_area_sqm', label: 'Källararea', format: v => `${v} m²` },
  { key: 'plot_area_sqm', label: 'Tomtarea', format: v => `${v} m²` },
  { key: 'rooms', label: 'Antal rum' },
  { key: 'purchase_price_sek', label: 'Köppris', format: sek },
  { key: 'purchase_year', label: 'Köpår' },
  { key: 'assessed_value_sek', label: 'Taxeringsvärde', format: sek },
  { key: 'heating_type', label: 'Uppvärmning (sammanfattning)' },
  { key: 'energy_class', label: 'Energiklass' },
  { key: 'energy_performance_kwh_sqm', label: 'Energiprestanda', format: v => `${v} kWh/m²/år` },
  { key: 'smart_home_platform', label: 'Smart hem-plattform' },
]

const RESEARCH_FIELDS: { key: keyof ResearchExtracted; label: string; format?: (v: unknown) => string }[] = [
  { key: 'municipality', label: 'Kommun' },
  { key: 'plot_area_sqm', label: 'Tomtarea', format: v => `${v} m²` },
  { key: 'rooms', label: 'Antal rum' },
  { key: 'build_year', label: 'Byggår' },
  { key: 'energy_class', label: 'Energiklass' },
  { key: 'assessed_value_sek', label: 'Taxeringsvärde', format: sek },
  { key: 'latest_sale_price_sek', label: 'Senaste försäljningspris', format: sek },
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

function hasExtra(e: Extracted) {
  return !!(e.solar_pv || e.ev_charging || (e.renovations?.length) || (e.ongoing_projects?.length) || e.strategy_notes)
}

function hasOperatingCost(e: Extracted) {
  const oc = e.operating_cost_sek
  return !!oc && Object.values(oc).some(v => v != null)
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
  const [heatingSelected, setHeatingSelected] = useState(false)
  const [extraSelected, setExtraSelected] = useState(false)
  const [operatingCostSelected, setOperatingCostSelected] = useState(false)
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
        const ex = data.extracted as Extracted
        setExtracted(ex)
        setCurrent(data.current)
        setGeo(data.geo)
        setSourceUrl(data.sourceUrl)
        const init: Record<string, boolean> = {}
        for (const f of FIELDS) {
          const val = ex[f.key]
          if (val == null) continue
          const curVal = data.current?.[f.key]
          init[f.key] = curVal == null || curVal === ''
        }
        setSelected(init)
        setHeatingSelected(!!ex.heating_systems?.length && !data.current?.heating_systems?.length)
        setExtraSelected(hasExtra(ex))
        setOperatingCostSelected(hasOperatingCost(ex) && !data.current?.operating_cost_sek)
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
    if (heatingSelected && extracted.heating_systems?.length) {
      payload.heating_systems = extracted.heating_systems
    }
    if (operatingCostSelected && hasOperatingCost(extracted)) {
      payload.operating_cost_sek = extracted.operating_cost_sek
    }
    if (selected.address && geo) {
      payload.raw_extracted = { ...(current?.raw_extracted ?? {}), lat: geo.lat, lng: geo.lng }
    }
    if (extraSelected && hasExtra(extracted)) {
      payload.raw_extracted = {
        ...(payload.raw_extracted as Record<string, unknown> ?? current?.raw_extracted ?? {}),
        extra: {
          solar_pv: extracted.solar_pv,
          ev_charging: extracted.ev_charging,
          renovations: extracted.renovations,
          ongoing_projects: extracted.ongoing_projects,
          strategy_notes: extracted.strategy_notes,
        },
      }
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
        <p className="text-muted text-sm mt-1">Länk, dokument eller fritext — en agent läser igenom och strukturerar husdata åt dig, inklusive flera uppvärmningssystem, solceller, renoveringar och pågående projekt</p>
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
            <p className="text-muted text-xs">Ju mer detaljerat, desto mer plockas ut — köppris, flera uppvärmningssystem, solceller, renoveringshistorik, pågående projekt</p>
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
          <p className="text-muted text-xs mb-3">Sparas inte förrän du väljer och trycker Spara. Fält som skulle ersätta något du redan har ifyllt är förbockade som avstängda.</p>

          <div className="divide-y divide-edge">
            {FIELDS.map(f => {
              const newVal = extracted[f.key]
              if (newVal == null) return null
              const curVal = current?.[f.key as keyof Profile]
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

          {!!extracted.heating_systems?.length && (
            <div className="mt-4 pt-4 border-t border-edge">
              <label className="flex items-start gap-3 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={heatingSelected}
                  onChange={e => setHeatingSelected(e.target.checked)}
                  className="mt-1"
                />
                <div className="flex-1 text-sm">
                  <div className="text-muted text-xs mb-1">Uppvärmningssystem ({extracted.heating_systems.length} st) — ersätter hela listan om vald</div>
                  <div className="flex flex-col gap-1.5">
                    {extracted.heating_systems.map((h, i) => (
                      <div key={i} className="bg-bg border border-edge rounded-lg px-3 py-2">
                        <span className="font-medium">{h.type ?? '—'}</span>
                        {h.role && <span className="text-muted"> · {h.role}</span>}
                        {h.installed_year && <span className="text-muted"> · sedan {h.installed_year}</span>}
                        {h.notes && <div className="text-muted text-xs mt-0.5">{h.notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </label>
            </div>
          )}

          {hasOperatingCost(extracted) && (
            <div className="mt-4 pt-4 border-t border-edge">
              <label className="flex items-start gap-3 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={operatingCostSelected}
                  onChange={e => setOperatingCostSelected(e.target.checked)}
                  className="mt-1"
                />
                <div className="flex-1 text-sm">
                  <div className="text-muted text-xs mb-1">Driftskostnad per år — ersätter tidigare uppgift om vald</div>
                  <div className="bg-bg border border-edge rounded-lg px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    {(Object.keys(OPERATING_COST_LABELS) as (keyof OperatingCost)[]).map(key => {
                      const val = extracted.operating_cost_sek?.[key]
                      if (val == null) return null
                      return (
                        <div key={key} className={key === 'total' ? 'col-span-2 pt-1 mt-1 border-t border-edge font-medium' : ''}>
                          <span className="text-muted text-xs">{OPERATING_COST_LABELS[key]}: </span>
                          {sek(val)}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </label>
            </div>
          )}

          {hasExtra(extracted) && (
            <div className="mt-4 pt-4 border-t border-edge">
              <label className="flex items-start gap-3 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={extraSelected}
                  onChange={e => setExtraSelected(e.target.checked)}
                  className="mt-1"
                />
                <div className="flex-1 text-sm">
                  <div className="text-muted text-xs mb-2">Extra info — sparas som ett block, ersätter tidigare extra info om vald</div>
                  <div className="flex flex-col gap-2">
                    {extracted.solar_pv && (
                      <div className="bg-bg border border-edge rounded-lg px-3 py-2">
                        <div className="text-xs text-muted mb-0.5">Solceller</div>
                        {extracted.solar_pv.capacity_kw != null && <div>{extracted.solar_pv.capacity_kw} kW installerat</div>}
                        {extracted.solar_pv.production_kwh_last_year != null && <div className="text-muted text-xs">Producerat: {extracted.solar_pv.production_kwh_last_year} kWh/år</div>}
                        {extracted.solar_pv.consumption_kwh_last_year != null && <div className="text-muted text-xs">Förbrukat: {extracted.solar_pv.consumption_kwh_last_year} kWh/år</div>}
                        {extracted.solar_pv.self_sufficiency_pct != null && <div className="text-muted text-xs">Självförsörjningsgrad: {extracted.solar_pv.self_sufficiency_pct}%</div>}
                      </div>
                    )}
                    {extracted.ev_charging && (
                      <div className="bg-bg border border-edge rounded-lg px-3 py-2">
                        <div className="text-xs text-muted mb-0.5">Elbilsladdning</div>
                        {extracted.ev_charging.annual_kwh != null && <div>{extracted.ev_charging.annual_kwh} kWh/år</div>}
                        {extracted.ev_charging.charger && <div className="text-muted text-xs">{extracted.ev_charging.charger}</div>}
                      </div>
                    )}
                    {!!extracted.renovations?.length && (
                      <div className="bg-bg border border-edge rounded-lg px-3 py-2">
                        <div className="text-xs text-muted mb-1">Renoveringshistorik</div>
                        <ul className="list-disc pl-4 flex flex-col gap-0.5">
                          {extracted.renovations.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                    {!!extracted.ongoing_projects?.length && (
                      <div className="bg-bg border border-edge rounded-lg px-3 py-2">
                        <div className="text-xs text-muted mb-1">Pågående/planerade projekt</div>
                        <div className="flex flex-col gap-2">
                          {extracted.ongoing_projects.map((p, i) => (
                            <div key={i}>
                              <span className="font-medium">{p.title ?? '—'}</span>
                              {(p.estimated_cost_sek != null || p.expected_savings_sek != null) && (
                                <span className="text-muted text-xs">
                                  {p.estimated_cost_sek != null && ` · ${sek(p.estimated_cost_sek)}`}
                                  {p.expected_savings_sek != null && ` · sparar ${sek(p.expected_savings_sek)}/år`}
                                </span>
                              )}
                              {p.goal && <div className="text-muted text-xs">{p.goal}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {extracted.strategy_notes && (
                      <div className="bg-bg border border-edge rounded-lg px-3 py-2">
                        <div className="text-xs text-muted mb-0.5">Strategi/principer</div>
                        <div>{extracted.strategy_notes}</div>
                      </div>
                    )}
                  </div>
                </div>
              </label>
            </div>
          )}

          <button
            onClick={commit}
            disabled={committing || (!Object.values(selected).some(Boolean) && !heatingSelected && !extraSelected && !operatingCostSelected)}
            className="mt-4 bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {committing ? 'Sparar...' : 'Spara valt'}
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
