'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { createSupabaseClient } from '@/lib/supabase'
import type { FoodCandidate } from '@/app/api/food/search/route'
import type { YazioDay } from '@/lib/yazio-history'
import { daysMetGoal, mealLabel, fastingLabel, weightGoalLabel, currentWeekDateKeys } from '@/lib/yazio-history'

// Same palette/tooltip convention as the other chart components in the app
// (WellnessCharts.tsx etc.) — kept local rather than shared, matching how
// each of those already defines its own copy.
const ACCENT = '#ccd400'
const MUTED = '#6b7280'
const EDGE = '#1e2428'
const chartTooltip = {
  contentStyle: { backgroundColor: '#161b1f', border: `1px solid ${EDGE}`, borderRadius: 12, color: '#e2e8ec', fontSize: 12 },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
}

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
  todayKey,
}: {
  dailyCalorieGoal: number | null
  todayEntries: FoodEntry[]
  quickPicks: QuickPick[]
  yazioHistory: YazioDay[]
  todayKey: string
}) {
  const router = useRouter()
  const hasYazio = yazioHistory.length > 0
  const yazioToday = hasYazio ? yazioHistory[0] : null

  const yazioByDate = new Map(yazioHistory.map(d => [d.date, d]))
  const weekKeys = currentWeekDateKeys(todayKey)
  const weekDaysWithData = weekKeys
    .map(k => yazioByDate.get(k))
    .filter((d): d is YazioDay => !!d && d.kcalEaten != null)

  const trendDays = yazioHistory.filter(d => d.kcalEaten != null).slice(0, 30).slice().reverse()
  const trendData = trendDays.map(d => ({
    date: new Date(`${d.date}T00:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }),
    Kcal: d.kcalEaten,
  }))
  const trendGoals = trendDays.map(d => d.kcalGoal).filter((g): g is number => g != null)
  const trendAvgGoal = trendGoals.length ? Math.round(trendGoals.reduce((s, g) => s + g, 0) / trendGoals.length) : null
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
                    <span className="text-muted">{yazioToday.startWeightKg.toFixed(1)} kg → </span>
                  )}
                  <span className="font-bold">{yazioToday.weightKg.toFixed(1)} kg</span>
                </div>
              </div>
              {yazioToday.startWeightKg != null && yazioToday.startWeightKg !== yazioToday.weightKg && (
                <span className={`text-xs font-mono ${yazioToday.weightKg < yazioToday.startWeightKg ? 'text-accent' : 'text-amber-500'}`}>
                  {yazioToday.weightKg < yazioToday.startWeightKg ? '' : '+'}{(yazioToday.weightKg - yazioToday.startWeightKg).toFixed(1)} kg
                </span>
              )}
            </div>
          )}

          {/* Veckans loggade dagar */}
          {hasYazio && (
            <div className="pt-3 border-t border-edge">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted">Veckans loggade dagar</span>
                {weekDaysWithData.length > 0 && (
                  <span className="text-xs text-muted">{daysMetGoal(weekDaysWithData)} av {weekDaysWithData.length} inom målet</span>
                )}
              </div>
              <div className="flex flex-col">
                {weekKeys.map(key => {
                  const day = yazioByDate.get(key)
                  const isFuture = key > todayKey
                  const isToday = key === todayKey
                  const label = new Date(`${key}T00:00:00`).toLocaleDateString('sv-SE', { weekday: 'short' })
                  const diff = day?.kcalEaten != null && day.kcalGoal != null ? day.kcalEaten - day.kcalGoal : null
                  return (
                    <div key={key} className={`flex items-center justify-between text-xs py-1.5 ${isFuture ? 'opacity-40' : ''}`}>
                      <span className={`capitalize ${isToday ? 'text-fg font-medium' : 'text-muted'}`}>{label}</span>
                      {day?.kcalEaten != null ? (
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-fg">{day.kcalEaten} kcal</span>
                          {diff != null && (
                            <span className={diff > 0 ? 'text-amber-500' : 'text-accent'}>
                              {diff > 0 ? '+' : ''}{diff}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted">{isFuture ? '–' : 'Ingen data'}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Utveckling, senaste 30 dagarna */}
          {trendData.length > 3 && (
            <div className="pt-3 border-t border-edge">
              <div className="text-xs text-muted uppercase tracking-wider mb-2">Utveckling, senaste 30 dagarna</div>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid vertical={false} stroke={EDGE} />
                  <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                  <Tooltip {...chartTooltip} formatter={(v) => [`${v} kcal`, 'Ätet']} />
                  {trendAvgGoal != null && <ReferenceLine y={trendAvgGoal} stroke={MUTED} strokeDasharray="3 3" />}
                  <Line type="monotone" dataKey="Kcal" stroke={ACCENT} strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
              {trendAvgGoal != null && <div className="text-[10px] text-muted mt-1">Streckad linje = snittmål ({trendAvgGoal} kcal)</div>}
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
