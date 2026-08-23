'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'
import type { FoodCandidate } from '@/app/api/food/search/route'
import type { YazioDay } from '@/lib/yazio-history'
import { daysMetGoal, mealLabel, fastingLabel, weightGoalLabel } from '@/lib/yazio-history'

export type FoodEntry = {
  id: string
  name: string
  calories: number
  protein_g: number | null
  source: 'database' | 'ai_text' | 'photo'
  logged_at: string
}

export type QuickPick = {
  name: string
  calories: number
  source: 'database' | 'ai_text' | 'photo'
  quantity: number | null
  unit: string | null
  kcal_per_100g: number | null
  off_id: string | null
  protein_g: number | null
  protein_per_100g: number | null
  times_logged: number
  last_logged: string
}

type Estimate = { name: string; kcal: number; protein_g: number; portion_desc: string; confidence: string; source: 'ai_text' | 'photo' }

// Liten/Normal/Stor — a simple multiplier on the base (per-100g or
// per-normal-portion) amount rather than asking for an exact gram figure
// nobody actually knows for a home-cooked meal.
const PORTION_CHIPS: { label: string; multiplier: number }[] = [
  { label: 'Liten', multiplier: 0.5 },
  { label: 'Normal', multiplier: 1 },
  { label: 'Stor', multiplier: 2 },
]

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

export default function FoodLogClient({
  dailyCalorieGoal,
  todayEntries,
  quickPicks,
  yazioHistory,
}: {
  dailyCalorieGoal: number | null
  todayEntries: FoodEntry[]
  quickPicks: QuickPick[]
  yazioHistory: YazioDay[]
}) {
  const router = useRouter()
  const hasYazio = yazioHistory.length > 0
  const yazioToday = hasYazio ? yazioHistory[0] : null
  const yazioWeek = yazioHistory.slice(0, 7)
  const [manualOpen, setManualOpen] = useState(!hasYazio)
  const [yazioSyncing, setYazioSyncing] = useState(false)
  const [yazioSyncMsg, setYazioSyncMsg] = useState('')
  const [feedback, setFeedback] = useState('')
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')

  async function syncYazioNow() {
    setYazioSyncing(true)
    setYazioSyncMsg('')
    try {
      const res = await fetch('/api/food/sync-yazio', { method: 'POST' })
      const data = await res.json()
      if (data.ok) { router.refresh() } else { setYazioSyncMsg(data.error ?? 'Något gick fel') }
    } catch {
      setYazioSyncMsg('Nätverksfel')
    }
    setYazioSyncing(false)
  }

  async function getFeedback() {
    setFeedbackLoading(true)
    setFeedbackError('')
    setFeedback('')
    try {
      const res = await fetch('/api/food/feedback', { method: 'POST' })
      const data = await res.json()
      if (res.ok) setFeedback(data.feedback)
      else setFeedbackError(data.error ?? 'Något gick fel')
    } catch {
      setFeedbackError('Nätverksfel')
    }
    setFeedbackLoading(false)
  }

  const [entries, setEntries] = useState(todayEntries)
  const todayTotal = entries.reduce((s, e) => s + e.calories, 0)
  const todayProtein = entries.reduce((s, e) => s + (e.protein_g ?? 0), 0)
  const goalPct = dailyCalorieGoal ? Math.min(100, Math.round((todayTotal / dailyCalorieGoal) * 100)) : null

  // ── Sök ──────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<FoodCandidate[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [selectedCandidate, setSelectedCandidate] = useState<FoodCandidate | null>(null)
  const [grams, setGrams] = useState('100')

  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [multiplier, setMultiplier] = useState(1)

  const [logging, setLogging] = useState(false)
  const [error, setError] = useState('')

  const [photoUploading, setPhotoUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (q: string) => {
    setSearching(true)
    setError('')
    try {
      const res = await fetch('/api/food/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const data = await res.json()
      setCandidates(data.candidates ?? [])
    } catch {
      setCandidates([])
    }
    setSearching(false)
  }, [])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (query.trim().length < 2) return
    searchTimer.current = setTimeout(() => runSearch(query.trim()), 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query, runSearch])

  // Derived rather than cleared via effect state: a too-short query simply
  // doesn't render results, without needing a synchronous setState in the
  // effect above for the "cleared" case.
  const visibleCandidates = query.trim().length < 2 ? null : candidates

  function pickCandidate(c: FoodCandidate) {
    setSelectedCandidate(c)
    setEstimate(null)
    setGrams(c.servingGrams ? String(c.servingGrams) : '100')
  }

  async function estimateFromText() {
    if (!query.trim()) return
    setEstimating(true)
    setError('')
    try {
      const res = await fetch('/api/food/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'text', description: query.trim() }),
      })
      const data = await res.json()
      if (res.ok) { setEstimate({ ...data, source: 'ai_text' }); setMultiplier(1); setSelectedCandidate(null) }
      else setError(data.error ?? 'Något gick fel')
    } catch {
      setError('Nätverksfel')
    }
    setEstimating(false)
  }

  async function onPhotoSelected(file: File) {
    setPhotoUploading(true)
    setError('')
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/food/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'photo', imageBase64: base64, mimeType: file.type }),
      })
      const data = await res.json()
      if (res.ok) { setEstimate({ ...data, source: 'photo' }); setMultiplier(1); setSelectedCandidate(null); setCandidates(null); setQuery('') }
      else setError(data.error ?? 'Något gick fel')
    } catch {
      setError('Kunde inte läsa bilden')
    }
    setPhotoUploading(false)
  }

  function clearFlow() {
    setSelectedCandidate(null)
    setEstimate(null)
    setCandidates(null)
    setQuery('')
    setGrams('100')
    setMultiplier(1)
  }

  async function logDatabaseCandidate() {
    if (!selectedCandidate) return
    const g = parseFloat(grams)
    if (!g || g <= 0) { setError('Ange en giltig mängd'); return }
    setLogging(true)
    setError('')
    try {
      const res = await fetch('/api/food/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedCandidate.name, source: 'database', offId: selectedCandidate.offId, grams: g }),
      })
      const data = await res.json()
      if (res.ok) { setEntries(prev => [data.entry, ...prev]); clearFlow() }
      else setError(data.error ?? 'Kunde inte logga')
    } catch {
      setError('Nätverksfel')
    }
    setLogging(false)
  }

  async function logEstimate() {
    if (!estimate) return
    setLogging(true)
    setError('')
    try {
      const res = await fetch('/api/food/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: estimate.name, source: estimate.source, baseKcal: estimate.kcal, baseProteinG: estimate.protein_g, multiplier }),
      })
      const data = await res.json()
      if (res.ok) { setEntries(prev => [data.entry, ...prev]); clearFlow() }
      else setError(data.error ?? 'Kunde inte logga')
    } catch {
      setError('Nätverksfel')
    }
    setLogging(false)
  }

  async function logQuickPick(pick: QuickPick) {
    setLogging(true)
    setError('')
    try {
      const body = pick.source === 'database' && pick.off_id && pick.quantity
        ? { name: pick.name, source: 'database', offId: pick.off_id, grams: pick.quantity }
        : { name: pick.name, source: pick.source, baseKcal: pick.calories, baseProteinG: pick.protein_g, multiplier: 1 }
      const res = await fetch('/api/food/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) setEntries(prev => [data.entry, ...prev])
      else setError(data.error ?? 'Kunde inte logga')
    } catch {
      setError('Nätverksfel')
    }
    setLogging(false)
  }

  async function deleteEntry(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id))
    const supabase = createSupabaseClient()
    await supabase.from('food_log').delete().eq('id', id)
  }

  const previewKcal = selectedCandidate
    ? Math.round(selectedCandidate.kcalPer100g * (parseFloat(grams) || 0) / 100)
    : estimate
    ? Math.round(estimate.kcal * multiplier)
    : null

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Mat</h1>
        <p className="text-muted text-sm mt-1">
          {hasYazio ? 'Synkas från YAZIO — logga manuellt bara om du vill lägga till något.' : 'Logga vad du äter — sök, fota eller välj från snabbval.'}
        </p>
      </div>

      {/* YAZIO-sammanfattning */}
      {hasYazio && yazioToday && (
        <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted uppercase tracking-wider">Idag (YAZIO)</span>
            <button
              type="button"
              onClick={syncYazioNow}
              disabled={yazioSyncing}
              className="text-xs bg-bg border border-edge px-3 py-1.5 rounded-lg text-fg disabled:opacity-50 hover:border-accent transition-colors"
            >
              {yazioSyncing ? 'Synkar...' : 'Synka nu'}
            </button>
          </div>
          {yazioSyncMsg && <div className="text-xs text-lcd">{yazioSyncMsg}</div>}
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-accent text-2xl font-bold">
              {yazioToday.kcalEaten ?? 0}
              {yazioToday.kcalGoal != null && <span className="text-muted text-sm font-normal"> / {yazioToday.kcalGoal} kcal</span>}
            </span>
          </div>
          {yazioToday.kcalGoal != null && (
            <div className="w-full h-1.5 bg-bg rounded-full overflow-hidden -mt-1.5">
              <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${Math.min(100, Math.round(((yazioToday.kcalEaten ?? 0) / yazioToday.kcalGoal) * 100))}%` }} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-bg rounded-lg py-2">
              <div className="font-mono text-fg text-sm font-bold">{yazioToday.proteinG ?? 0}g</div>
              <div className="text-muted text-[10px] mt-0.5">Protein</div>
            </div>
            <div className="bg-bg rounded-lg py-2">
              <div className="font-mono text-fg text-sm font-bold">{yazioToday.carbG ?? 0}g</div>
              <div className="text-muted text-[10px] mt-0.5">Kolhydrater</div>
            </div>
            <div className="bg-bg rounded-lg py-2">
              <div className="font-mono text-fg text-sm font-bold">{yazioToday.fatG ?? 0}g</div>
              <div className="text-muted text-[10px] mt-0.5">Fett</div>
            </div>
          </div>

          {(yazioToday.fastingTemplate || yazioToday.waterGoalMl != null) && (
            <div className="flex items-center gap-3 flex-wrap">
              {yazioToday.fastingTemplate && (
                <span className="text-xs bg-bg border border-edge rounded-full px-3 py-1 text-fg">🕐 {fastingLabel(yazioToday.fastingTemplate)}</span>
              )}
              {yazioToday.waterGoalMl != null && (
                <span className="text-xs bg-bg border border-edge rounded-full px-3 py-1 text-fg">
                  💧 {((yazioToday.waterMl ?? 0) / 1000).toFixed(1)} / {(yazioToday.waterGoalMl / 1000).toFixed(1)} L
                </span>
              )}
            </div>
          )}

          {/* Måltider */}
          {Object.entries(yazioToday.meals).some(([, m]) => m && m.kcal != null && m.kcal > 0) && (
            <div className="pt-3 border-t border-edge flex flex-col gap-1.5">
              {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(key => {
                const m = yazioToday.meals[key]
                if (!m || m.kcal == null) return null
                return (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-muted">{mealLabel(key)}</span>
                    <span className="font-mono text-fg">{m.kcal} kcal{m.kcalGoal != null ? <span className="text-muted"> / {m.kcalGoal}</span> : ''}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Viktresa */}
          {yazioToday.weightKg != null && (
            <div className="pt-3 border-t border-edge flex items-center justify-between">
              <div>
                <div className="text-xs text-muted">Vikt{weightGoalLabel(yazioToday.weightGoal) ? ` · mål: ${weightGoalLabel(yazioToday.weightGoal)}` : ''}</div>
                <div className="font-mono text-fg text-sm mt-0.5">
                  {yazioToday.startWeightKg != null && yazioToday.startWeightKg !== yazioToday.weightKg && (
                    <span className="text-muted">{yazioToday.startWeightKg} kg → </span>
                  )}
                  <span className="font-bold">{yazioToday.weightKg} kg</span>
                </div>
              </div>
              {yazioToday.startWeightKg != null && yazioToday.startWeightKg !== yazioToday.weightKg && (
                <span className={`text-xs font-mono ${yazioToday.weightKg < yazioToday.startWeightKg ? 'text-accent' : 'text-amber-500'}`}>
                  {yazioToday.weightKg < yazioToday.startWeightKg ? '' : '+'}{(yazioToday.weightKg - yazioToday.startWeightKg).toFixed(1)} kg
                </span>
              )}
            </div>
          )}

          {/* Veckans progress */}
          {yazioWeek.length > 1 && (
            <div className="pt-3 border-t border-edge">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted">Senaste {yazioWeek.length} dagarna</span>
                <span className="text-xs text-muted">{daysMetGoal(yazioWeek)} av {yazioWeek.length} dagar inom målet</span>
              </div>
              <div className="flex items-end gap-1.5 h-16">
                {yazioWeek.slice().reverse().map(d => {
                  const pct = d.kcalGoal && d.kcalEaten != null ? Math.min(150, Math.round((d.kcalEaten / d.kcalGoal) * 100)) : 0
                  const over = d.kcalGoal != null && d.kcalEaten != null && d.kcalEaten > d.kcalGoal
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                      <div
                        className={`w-full rounded-t ${over ? 'bg-amber-500' : 'bg-accent'}`}
                        style={{ height: `${Math.max(4, Math.min(100, pct))}%` }}
                        title={`${d.date}: ${d.kcalEaten ?? '–'} / ${d.kcalGoal ?? '–'} kcal`}
                      />
                      <span className="text-muted text-[9px]">{new Date(d.date).toLocaleDateString('sv-SE', { weekday: 'narrow' })}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* AI-feedback */}
          <div className="pt-3 border-t border-edge">
            {feedback ? (
              <p className="text-sm text-fg leading-relaxed">{feedback}</p>
            ) : (
              <button
                type="button"
                onClick={getFeedback}
                disabled={feedbackLoading}
                className="text-xs bg-accent text-bg font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed hover:opacity-90 transition-opacity w-full"
              >
                {feedbackLoading ? 'Tänker...' : '✨ Få feedback på dagens mat & veckans progress'}
              </button>
            )}
            {feedbackError && <p className="text-red-400 text-xs mt-2">{feedbackError}</p>}
          </div>
        </div>
      )}

      {/* Manuell loggning — alltid synlig utan YAZIO, dold bakom en knapp med */}
      {hasYazio && (
        <button
          type="button"
          onClick={() => setManualOpen(v => !v)}
          className="text-xs text-muted hover:text-fg transition-colors self-start flex items-center gap-1.5"
        >
          {manualOpen ? '▾' : '▸'} Logga manuellt {manualOpen ? '' : '(t.ex. något YAZIO missade)'}
        </button>
      )}

      {(!hasYazio || manualOpen) && (
      <>
      {/* Idag */}
      <div className="bg-card border border-edge rounded-2xl p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm font-medium">Idag</span>
          <span className="font-mono text-accent text-lg font-bold">
            {todayTotal} {dailyCalorieGoal ? <span className="text-muted text-sm font-normal">/ {dailyCalorieGoal} kcal</span> : <span className="text-muted text-sm font-normal">kcal</span>}
          </span>
        </div>
        {goalPct != null && (
          <div className="w-full h-1.5 bg-bg rounded-full overflow-hidden mb-1">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${goalPct}%` }} />
          </div>
        )}
        {!dailyCalorieGoal && (
          <p className="text-muted text-xs mt-1">
            Inget kalorimål satt — <a href="/dashboard/profil" className="text-accent hover:underline">ange ett i Profil</a> för att se det som en budget.
          </p>
        )}
        <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-edge">
          <span className="text-muted text-xs">Protein (uppskattat)</span>
          <span className="font-mono text-fg text-sm">{Math.round(todayProtein)} g</span>
        </div>
        {entries.length > 0 && (
          <div className="flex flex-col gap-1 mt-3">
            {entries.map(e => (
              <div key={e.id} className="flex items-center justify-between gap-2 text-sm bg-bg rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <span className="text-fg break-words">{e.name}</span>
                  <span className="text-muted text-xs ml-2 whitespace-nowrap">{fmtTime(e.logged_at)}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-mono text-muted whitespace-nowrap">{e.calories} kcal</span>
                  <button onClick={() => deleteEntry(e.id)} className="text-muted hover:text-red-400 transition-colors text-xs px-1">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Snabbval */}
      {quickPicks.length > 0 && (
        <div className="bg-card border border-edge rounded-2xl p-4">
          <div className="text-sm font-medium mb-3">Snabbval</div>
          <div className="flex flex-wrap gap-2">
            {quickPicks.map(p => (
              <button
                key={p.name}
                onClick={() => logQuickPick(p)}
                disabled={logging}
                className="text-xs border border-edge rounded-xl px-3 py-2 text-fg hover:border-accent/30 transition-colors disabled:opacity-50"
              >
                {p.name} <span className="text-muted">· {p.calories} kcal</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Logga mat */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        <div className="text-sm font-medium">Logga mat</div>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedCandidate(null); setEstimate(null) }}
          placeholder="Sök t.ex. hamburgare..."
          className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
        />

        {searching && <p className="text-muted text-xs">Söker...</p>}

        {visibleCandidates && visibleCandidates.length > 0 && !selectedCandidate && !estimate && (
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            {visibleCandidates.map(c => (
              <button
                key={c.offId}
                onClick={() => pickCandidate(c)}
                className="text-left text-sm bg-bg rounded-lg px-3 py-2 hover:border-accent/30 border border-transparent transition-colors"
              >
                <div className="text-fg">{c.name}{c.brand && <span className="text-muted"> · {c.brand}</span>}</div>
                <div className="text-muted text-xs">{c.kcalPer100g} kcal/100g</div>
              </button>
            ))}
          </div>
        )}

        {visibleCandidates && visibleCandidates.length === 0 && !selectedCandidate && !estimate && query.trim().length >= 2 && !searching && (
          <div className="bg-bg rounded-xl p-3 text-sm">
            <p className="text-muted text-xs mb-2">Hittade inget i livsmedelsdatabasen för &quot;{query.trim()}&quot;.</p>
            <button
              onClick={estimateFromText}
              disabled={estimating}
              className="text-xs bg-accent text-bg font-semibold px-3 py-2 rounded-lg disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed"
            >
              {estimating ? 'Uppskattar...' : 'Uppskatta med AI'}
            </button>
          </div>
        )}

        {selectedCandidate && (
          <div className="bg-bg rounded-xl p-3 flex flex-col gap-3">
            <div className="text-sm text-fg">{selectedCandidate.name}</div>
            <div>
              <label className="text-muted text-xs block mb-1.5">Mängd (gram)</label>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={grams}
                onChange={e => setGrams(e.target.value)}
                className="w-full bg-card border border-edge rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex gap-2">
              {PORTION_CHIPS.map(chip => (
                <button
                  key={chip.label}
                  onClick={() => setGrams(String(Math.round((selectedCandidate.servingGrams ?? 100) * chip.multiplier)))}
                  className="text-xs border border-edge rounded-lg px-2.5 py-1.5 text-muted hover:text-fg hover:border-accent/30 transition-colors"
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-accent text-lg">~{previewKcal} kcal</span>
              <div className="flex gap-2">
                <button onClick={clearFlow} className="text-xs text-muted px-3 py-2">Avbryt</button>
                <button
                  onClick={logDatabaseCandidate}
                  disabled={logging}
                  className="text-xs bg-accent text-bg font-semibold px-4 py-2 rounded-lg disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed"
                >
                  {logging ? 'Loggar...' : 'Logga'}
                </button>
              </div>
            </div>
          </div>
        )}

        {estimate && (
          <div className="bg-bg rounded-xl p-3 flex flex-col gap-3">
            <div>
              <div className="text-sm text-fg">{estimate.name}</div>
              <div className="text-muted text-xs">{estimate.portion_desc} · AI-uppskattning ({estimate.confidence} säkerhet)</div>
            </div>
            <div className="flex gap-2">
              {PORTION_CHIPS.map(chip => (
                <button
                  key={chip.label}
                  onClick={() => setMultiplier(chip.multiplier)}
                  className={`text-xs border rounded-lg px-2.5 py-1.5 transition-colors ${multiplier === chip.multiplier ? 'border-accent/30 text-accent bg-accent/5' : 'border-edge text-muted hover:text-fg'}`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-accent text-lg">~{previewKcal} kcal</span>
              <div className="flex gap-2">
                <button onClick={clearFlow} className="text-xs text-muted px-3 py-2">Avbryt</button>
                <button
                  onClick={logEstimate}
                  disabled={logging}
                  className="text-xs bg-accent text-bg font-semibold px-4 py-2 rounded-lg disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed"
                >
                  {logging ? 'Loggar...' : 'Logga'}
                </button>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="border-t border-edge pt-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onPhotoSelected(f); e.target.value = '' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={photoUploading}
            className="text-xs border border-edge rounded-xl px-4 py-2.5 text-fg hover:border-accent/30 transition-colors disabled:opacity-50 w-full"
          >
            {photoUploading ? 'Tolkar bild...' : '📷 Fota en rätt'}
          </button>
          <p className="text-muted text-xs mt-1.5">Bilden skickas till Google Gemini för att tolkas — samma AI som resten av appens uppskattningar.</p>
        </div>
      </div>
      </>
      )}
    </div>
  )
}
