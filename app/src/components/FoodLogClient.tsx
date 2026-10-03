'use client'

import Modal from '@/components/Modal'
import { quickPickMacroText } from '@/lib/quick-pick-format'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { createSupabaseClient } from '@/lib/supabase'
import type { FoodCandidate } from '@/app/api/food/search/route'
import type { YazioDay } from '@/lib/yazio-history'
import { stockholmDateKey } from '@/lib/dates'
import { daysMetGoal, mealLabel, fastingLabel, weightGoalLabel, currentWeekDateKeys } from '@/lib/yazio-history'
import {
  KOST_MEALS, MULTI_ENTRY_MEALS, computeDayCompleteness, groupEntriesByMeal, kcalTotalForDay, metricTotalForDay, kostMealLabel, kostMetricLabel, guessMealForHour,
  type KostMeal,
} from '@/lib/kost'
import { estimateBurnedKcalForDay, estimateBurnedKcalForStatus } from '@/lib/burned-calories'
import type { CalorieGoalSource } from '@/lib/calorie-goal'
import { dayCalorieStatus, DAY_CALORIE_STATUS_TEXT_COLOR, DAY_CALORIE_STATUS_BG } from '@/lib/day-calorie-status'
import KostSettingsCard from '@/components/KostSettingsCard'
import EditEntryDialog from '@/components/food-log/EditEntryDialog'
import DayDetailDialog from '@/components/food-log/DayDetailDialog'
import QuickPickDialog from '@/components/food-log/QuickPickDialog'
import {
  macroSuffix, fmtDateLabel,
  type FoodEntry, type QuickPick, type KostSettings, type DayContextTag, type DayNote, type QuickPickConfirm, type LogQuickPickOpts,
} from '@/components/food-log/shared'

// Types live in food-log/shared.ts; re-exported so existing imports keep working.
export type { FoodEntry, QuickPick, KostSettings, DayContextTag, DayNote } from '@/components/food-log/shared'

// Same palette/tooltip convention as the other chart components in the app
// (WellnessCharts.tsx etc.) — kept local rather than shared, matching how
// each of those already defines its own copy.
const ACCENT = '#ccd400'
const MUTED = '#6b7280'
const EDGE = '#1e2428'
const RED = '#e5644a'
const chartTooltip = {
  contentStyle: { backgroundColor: '#161b1f', border: `1px solid ${EDGE}`, borderRadius: 12, color: '#e2e8ec', fontSize: 12 },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
}

type Estimate = { name: string; kcal: number; protein_g: number; carb_g: number; fat_g: number; portion_desc: string; confidence: string; source: 'ai_text' | 'photo' }
type PendingPhoto = { data: string; mimeType: string }
type PlanItem = { name: string; portion: string; kcal: number; proteinG: number }
type PlanOption = { note: string; items: PlanItem[]; totalKcal: number; totalProteinG: number }
type PlanSuggestion = { minimal: PlanOption; maxed: PlanOption; remainingKcal: number; remainingProteinG: number | null }

// Liten/Normal/Stor — a simple multiplier on the base (per-100g or
// per-normal-portion) amount rather than asking for an exact gram figure
// nobody actually knows for a home-cooked meal.
const PORTION_CHIPS: { label: string; multiplier: number }[] = [
  { label: 'Liten', multiplier: 0.5 },
  { label: 'Normal', multiplier: 1 },
  { label: 'Stor', multiplier: 2 },
]

const MAX_LOG_PHOTOS = 4

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}
// Resizes+recompresses to JPEG before upload — a raw phone photo (often
// several MB) times up to MAX_LOG_PHOTOS would otherwise blow past
// Vercel's ~4.5MB request-body limit for this route's serverless function,
// which the client then misreports as "Nätverksfel" (see FoodLogClient's
// generic catch blocks) instead of the real payload-too-large cause.
function resizeImageFile(file: File, maxDim = 1800, quality = 0.85): Promise<PendingPhoto> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      URL.revokeObjectURL(url)
      if (!ctx) { reject(new Error('Kunde inte skapa canvas-kontext')); return }
      ctx.drawImage(img, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      resolve({ data: dataUrl.split(',')[1] ?? '', mimeType: 'image/jpeg' })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Kunde inte läsa bilden')) }
    img.src = url
  })
}

export default function FoodLogClient({
  dailyCalorieGoal,
  calorieGoalSource,
  entries: initialEntries,
  quickPicks: initialQuickPicks,
  yazioHistory,
  todayKey,
  kostSettings,
  dayOverrides: initialDayOverrides,
  deficitSummary,
  dayNotes: initialDayNotes,
  bmrKcal,
  activityKcalByDate,
  manualActivityKcalByDate,
  garminTotalCaloriesByDate,
  garminActiveCaloriesByDate,
  garminCorrection,
  userId,
}: {
  dailyCalorieGoal: number | null
  calorieGoalSource: CalorieGoalSource | null
  entries: FoodEntry[]
  quickPicks: QuickPick[]
  yazioHistory: YazioDay[]
  todayKey: string
  kostSettings: KostSettings
  dayOverrides: string[]
  deficitSummary: { avgDiffKcal: number; budgetKcal: number } | null
  dayNotes: DayNote[]
  bmrKcal: number
  activityKcalByDate: Record<string, number>
  manualActivityKcalByDate: Record<string, number>
  garminTotalCaloriesByDate: Record<string, number>
  garminActiveCaloriesByDate: Record<string, number>
  garminCorrection: number
  userId: string
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Forces KostSettingsCard to remount with fresh server values whenever a
  // field it owns changes from elsewhere (Sunday's cron recomputes
  // protein_goal_g in auto mode independently of this page being open) —
  // otherwise the card's own local state, seeded once on mount, would go
  // stale and its next Spara would silently overwrite that change. Same
  // pattern as ViktmalSettingsCard's resync key on Viktmål.
  const settingsResyncKey = [kostSettings.trackedMetrics.join(','), kostSettings.trackedMeals.join(','), kostSettings.remindersEnabled, kostSettings.eveningGuardEnabled, kostSettings.eveningGuardHour, kostSettings.proteinGoalG, kostSettings.proteinGoalMode, kostSettings.carbGoalG, kostSettings.fatGoalG].join('|')
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

  // ── Upplägg-förslag (Daniel: "AI bedömning på bästa upplägget på mat...
  // minimalt kcal upplägg... ett maxat, men ändå under plan. Baserat på de
  // man ätit.") — byggs ENDAST av rätter från de egna quick picks, aldrig
  // påhittade, se api/food/plan-suggestion.
  const [planSuggestion, setPlanSuggestion] = useState<PlanSuggestion | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState('')

  async function getPlanSuggestion() {
    setPlanLoading(true)
    setPlanError('')
    setPlanSuggestion(null)
    try {
      const res = await fetch('/api/food/plan-suggestion', { method: 'POST' })
      const data = await res.json()
      if (res.ok) setPlanSuggestion(data)
      else setPlanError(data.error ?? 'Något gick fel')
    } catch {
      setPlanError('Nätverksfel')
    }
    setPlanLoading(false)
  }

  // ── Loggade poster (manuell del) ────────────────────────────────────────
  const [entries, setEntries] = useState(initialEntries)
  const [dayOverrides, setDayOverrides] = useState<Set<string>>(new Set(initialDayOverrides))
  const entriesByDate = useMemo(() => {
    const map = new Map<string, FoodEntry[]>()
    for (const e of entries) {
      const key = stockholmDateKey(new Date(e.logged_at))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return map
  }, [entries])
  const todayEntries = entriesByDate.get(todayKey) ?? []
  const todayTotal = kcalTotalForDay(todayEntries)
  const todayProtein = todayEntries.reduce((s, e) => s + (e.protein_g ?? 0), 0)
  const goalPct = dailyCalorieGoal ? Math.min(100, Math.round((todayTotal / dailyCalorieGoal) * 100)) : null
  const todayGroups = groupEntriesByMeal(todayEntries)
  const unmatchedTodayEntries = todayEntries.filter(e => e.meal == null)
  const [openMealGroups, setOpenMealGroups] = useState<Set<KostMeal | '_unmatched'>>(new Set())

  async function deleteEntry(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id))
    const supabase = createSupabaseClient()
    await supabase.from('food_log').delete().eq('id', id)
  }

  async function markDayComplete(dateKey: string) {
    setDayOverrides(prev => new Set(prev).add(dateKey))
    try {
      await fetch('/api/food/day-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateKey }),
      })
    } catch { /* optimistic — a failed network call just means it'll show as incomplete again on next load */ }
  }

  // ── Dagskontext (Daniels idé #4) — kort tagg + valfri text per dag,
  // instant-save på klick/blur snarare än ett separat sparknapp-flöde.
  const [dayNotes, setDayNotes] = useState<Map<string, { tag: DayContextTag | null; note: string }>>(
    () => new Map(initialDayNotes.map(n => [n.date, { tag: n.tag as DayContextTag | null, note: n.note ?? '' }]))
  )
  async function saveDayNote(dateKey: string, tag: DayContextTag | null, note: string) {
    setDayNotes(prev => new Map(prev).set(dateKey, { tag, note }))
    try {
      await fetch('/api/kost/day-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateKey, tag, note: note.trim() || null }),
      })
    } catch { /* optimistic — will show correctly again on next load if this failed */ }
  }

  // ── Redigera en loggad post ──────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editKcal, setEditKcal] = useState('')
  const [editProtein, setEditProtein] = useState('')
  const [editCarb, setEditCarb] = useState('')
  const [editFat, setEditFat] = useState('')
  const [editMeal, setEditMeal] = useState<KostMeal | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  function startEdit(entry: FoodEntry) {
    setEditingId(entry.id)
    setEditName(entry.name)
    setEditKcal(String(entry.calories))
    setEditProtein(entry.protein_g != null ? String(entry.protein_g) : '')
    setEditCarb(entry.carb_g != null ? String(entry.carb_g) : '')
    setEditFat(entry.fat_g != null ? String(entry.fat_g) : '')
    setEditMeal(entry.meal)
  }
  async function saveEdit() {
    if (!editingId) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/food/log/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Tomt namn skickas inte med — PATCH-routen avvisar det ändå
          // (name saknas), och det befintliga namnet ska stå kvar orört
          // om fältet av misstag rensats istället för redigerats.
          ...(editName.trim() ? { name: editName.trim() } : {}),
          calories: Number(editKcal) || 0,
          proteinG: editProtein.trim() ? Number(editProtein) : null,
          carbG: editCarb.trim() ? Number(editCarb) : null,
          fatG: editFat.trim() ? Number(editFat) : null,
          meal: editMeal,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setEntries(prev => prev.map(e => e.id === editingId ? data.entry : e))
        setEditingId(null)
      }
    } catch { /* leave the edit form open so the user can retry */ }
    setEditSaving(false)
  }

  // ── Snabbval: favoriter överst, kan tas bort ─────────────────────────────
  const [quickPicks, setQuickPicks] = useState(initialQuickPicks)
  const sortedQuickPicks = useMemo(() => [...quickPicks].sort((a, b) => (Number(b.pinned) - Number(a.pinned))), [quickPicks])
  const QUICK_PICKS_COLLAPSED_COUNT = 12
  const [quickPicksExpanded, setQuickPicksExpanded] = useState(false)
  const visibleQuickPicks = quickPicksExpanded ? sortedQuickPicks : sortedQuickPicks.slice(0, QUICK_PICKS_COLLAPSED_COUNT)

  async function toggleFavorite(name: string) {
    const current = quickPicks.find(q => q.name === name)
    const nextPinned = !current?.pinned
    setQuickPicks(prev => prev.map(q => q.name === name ? { ...q, pinned: nextPinned } : q))
    try {
      await fetch('/api/food/quick-pick-prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, pinned: nextPinned }),
      })
    } catch { /* optimistic update stands until next page load */ }
  }
  async function removeQuickPick(name: string) {
    setQuickPicks(prev => prev.filter(q => q.name !== name))
    try {
      await fetch('/api/food/quick-pick-prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, hidden: true }),
      })
    } catch { /* optimistic update stands until next page load */ }
  }

  // ── Logga mat: sök ────────────────────────────────────────────────────────
  const [logOpen, setLogOpen] = useState(false)
  const [logMeal, setLogMeal] = useState<KostMeal | null>(null)
  const [logDate, setLogDate] = useState(todayKey)
  const [logMethod, setLogMethod] = useState<'dish' | 'label' | 'search' | 'text'>('dish')
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

  const [logPhotos, setLogPhotos] = useState<PendingPhoto[]>([])
  const [logPhotoNote, setLogPhotoNote] = useState('')
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

  const visibleCandidates = query.trim().length < 2 ? null : candidates

  function pickCandidate(c: FoodCandidate) {
    setSelectedCandidate(c)
    setEstimate(null)
    setGrams(c.servingGrams ? String(c.servingGrams) : '100')
  }

  function openLogFlow(meal: KostMeal | null, forDate?: string) {
    setLogMeal(meal)
    setLogDate(forDate ?? todayKey)
    setLogMethod('dish')
    setLogPhotos([])
    setQuery('')
    setCandidates(null)
    setSelectedCandidate(null)
    setEstimate(null)
    setError('')
    setLogOpen(true)
  }
  function closeLogFlow() {
    setLogOpen(false)
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

  async function onPhotosSelected(files: FileList) {
    setError('')
    const remaining = MAX_LOG_PHOTOS - logPhotos.length
    const toAdd = Array.from(files).slice(0, Math.max(0, remaining))
    try {
      const encoded = await Promise.all(toAdd.map(f => resizeImageFile(f)))
      setLogPhotos(prev => [...prev, ...encoded])
    } catch {
      setError('Kunde inte läsa bilden')
    }
  }

  async function analyzePhotos() {
    if (logPhotos.length === 0) return
    setEstimating(true)
    setError('')
    try {
      const res = await fetch('/api/food/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'photo', images: logPhotos, photoKind: logMethod === 'label' ? 'label' : 'dish', note: logPhotoNote.trim() || undefined }),
      })
      const data = await res.json()
      if (res.ok) { setEstimate({ ...data, source: 'photo' }); setMultiplier(1); setSelectedCandidate(null) }
      else setError(data.error ?? 'Något gick fel')
    } catch {
      setError('Nätverksfel')
    }
    setEstimating(false)
  }

  function clearFlow() {
    setSelectedCandidate(null)
    setEstimate(null)
    setCandidates(null)
    setQuery('')
    setGrams('100')
    setMultiplier(1)
    setLogPhotos([])
    setLogPhotoNote('')
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
        body: JSON.stringify({ name: selectedCandidate.name, source: 'database', offId: selectedCandidate.offId, grams: g, meal: logMeal, loggedDate: logDate }),
      })
      const data = await res.json()
      if (res.ok) { setEntries(prev => [data.entry, ...prev]); clearFlow(); setLogOpen(false) }
      else setError(data.error ?? 'Kunde inte logga')
    } catch {
      setError('Nätverksfel')
    }
    setLogging(false)
  }

  // Editable in the form (name/kcal/protein/carb/fat) before saving — the
  // AI estimate or label read is a starting point, never trusted as-is
  // (Daniel: "manuellt redigera").
  const [resultName, setResultName] = useState('')
  const [resultKcal, setResultKcal] = useState('')
  const [resultProtein, setResultProtein] = useState('')
  const [resultCarb, setResultCarb] = useState('')
  const [resultFat, setResultFat] = useState('')
  useEffect(() => {
    if (!estimate) return
    // Syncing external state (the AI estimate / label read) into editable
    // local form fields — same justified pattern as reset-password/new.
    /* eslint-disable react-hooks/set-state-in-effect */
    setResultName(estimate.name)
    setResultKcal(String(Math.round(estimate.kcal * multiplier)))
    setResultProtein(String(Math.round(estimate.protein_g * multiplier)))
    setResultCarb(String(Math.round(estimate.carb_g * multiplier)))
    setResultFat(String(Math.round(estimate.fat_g * multiplier)))
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [estimate, multiplier])

  async function logEstimate() {
    if (!estimate) return
    setLogging(true)
    setError('')
    try {
      const res = await fetch('/api/food/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: resultName.trim() || estimate.name,
          source: estimate.source,
          baseKcal: Number(resultKcal) || 0,
          baseProteinG: resultProtein.trim() ? Number(resultProtein) : undefined,
          baseCarbG: resultCarb.trim() ? Number(resultCarb) : undefined,
          baseFatG: resultFat.trim() ? Number(resultFat) : undefined,
          multiplier: 1,
          meal: logMeal,
          loggedDate: logDate,
        }),
      })
      const data = await res.json()
      if (res.ok) { setEntries(prev => [data.entry, ...prev]); clearFlow(); setLogOpen(false) }
      else setError(data.error ?? 'Kunde inte logga')
    } catch {
      setError('Nätverksfel')
    }
    setLogging(false)
  }

  // Ett snabbval postade tidigare alltid en OTAGGAD post (ingen måltid
  // alls) — Daniel: "väljer man ur den listan så ska man direkt få popup
  // att fylla i typ av måltid och om man vill justera något." Nu öppnar
  // varje tryck den här bekräftelserutan istället för att logga direkt.
  // eveningGuard slås fortfarande på (idé #7 — lätt att råka dubbellogga
  // ett snabbt tappat kvällsmellanmål) men visas som ett extra val INUTI
  // samma popup istället för en andra, separat dialog.
  const [quickPickConfirm, setQuickPickConfirm] = useState<QuickPickConfirm | null>(null)

  async function logQuickPick(pick: QuickPick, opts: LogQuickPickOpts) {
    setLogging(true)
    setError('')
    try {
      if (opts.replaceEntryId) await deleteEntry(opts.replaceEntryId)
      const isDatabase = pick.source === 'database' && !!pick.off_id
      const body = isDatabase
        ? { name: pick.name, source: 'database', offId: pick.off_id, grams: opts.grams ?? pick.quantity, meal: opts.meal }
        : { name: pick.name, source: pick.source, baseKcal: opts.baseKcal ?? pick.calories, baseProteinG: opts.baseProteinG !== undefined ? opts.baseProteinG : pick.protein_g, multiplier: opts.multiplier ?? 1, meal: opts.meal }
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
    setQuickPickConfirm(null)
  }

  function handleQuickPickTap(pick: QuickPick) {
    const eveningGuard = kostSettings.eveningGuardEnabled && new Date().getHours() >= kostSettings.eveningGuardHour && todayEntries.length > 0
    setQuickPickConfirm({
      pick,
      meal: guessMealForHour(new Date().getHours(), kostSettings.trackedMeals),
      grams: pick.source === 'database' && pick.quantity ? String(pick.quantity) : '',
      multiplier: '1',
      eveningGuard,
      kcal: String(pick.calories),
      protein: pick.protein_g != null ? String(pick.protein_g) : '',
    })
  }

  // Daniel: tryck på en rätt → samma ruta som "Logga", men med kcal och protein
  // redigerbara. "Logga" loggar med de värden som står i rutan (engångs om de
  // ändrats); "Uppdatera rätten" sparar dem på snabbvalet för framtida
  // loggningar. Redan loggade måltider rörs aldrig.
  async function updateQuickPickValues(pick: QuickPick, kcal: number, proteinG: number | null) {
    setLogging(true)
    setError('')
    try {
      const res = await fetch('/api/food/quick-pick-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pick.name, calories: kcal, proteinG }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setQuickPicks(prev => prev.map(q => q.name === pick.name ? { ...q, calories: kcal, protein_g: proteinG, edited: true } : q))
        setQuickPickConfirm(null)
      } else {
        setError(data.error ?? 'Kunde inte spara')
      }
    } catch {
      setError('Nätverksfel')
    }
    setLogging(false)
  }

  const previewKcal = selectedCandidate
    ? Math.round(selectedCandidate.kcalPer100g * (parseFloat(grams) || 0) / 100)
    : estimate
    ? Math.round(estimate.kcal * multiplier)
    : null

  // ── Kalender (bara manuell loggning + kost-mål påslaget) ─────────────────
  const [kostView, setKostView] = useState<'week' | 'calendar'>('week')
  const [calMonthOffset, setCalMonthOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const calBase = useMemo(() => {
    const [y, m] = todayKey.split('-').map(Number)
    const d = new Date(y, m - 1 + calMonthOffset, 1)
    return { year: d.getFullYear(), month: d.getMonth() } // month: 0-indexed
  }, [todayKey, calMonthOffset])

  const calDays = useMemo(() => {
    const { year, month } = calBase
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7 // 0=mån
    return { year, month, daysInMonth, firstDow }
  }, [calBase])

  function dateKeyFor(year: number, month: number, day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // Förbränt för en given dag i dagslistorna nedan (Daniel: "smidigt om
  // totalt förbränt loggades där med") — Garmins uppmätta dygnstotal när
  // den finns, annars BMR + den dagens loggade träning.
  function burnedKcalForDate(dateKey: string): number {
    return estimateBurnedKcalForDay(
      bmrKcal,
      activityKcalByDate[dateKey] ?? 0,
      manualActivityKcalByDate[dateKey] ?? 0,
      garminTotalCaloriesByDate[dateKey] ?? null
    ).kcal
  }

  // Samma sak, fast bara för grön/gul/röd-bedömningen (dayCalorieStatus) —
  // rabatterar träningsdelen med samma försiktighetsfaktor Viktmåls budget
  // redan använder (Daniel: "bra att se det med försiktighet... så jag
  // inte tummar på budgeten"). Den vanliga "bränt X kcal"-siffran ovan
  // förblir okorrigerad.
  function burnedKcalForStatus(dateKey: string): number {
    return estimateBurnedKcalForStatus(
      bmrKcal,
      activityKcalByDate[dateKey] ?? 0,
      manualActivityKcalByDate[dateKey] ?? 0,
      { totalCalories: garminTotalCaloriesByDate[dateKey] ?? null, activeCalories: garminActiveCaloriesByDate[dateKey] ?? null },
      garminCorrection
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Kost</h1>
        <p className="text-muted text-sm mt-1">
          {hasYazio ? 'Synkas från YAZIO — logga manuellt bara om du vill lägga till något.' : 'Logga vad du äter — sök, fota eller välj från snabbval.'}
        </p>
        {deficitSummary && (
          <a href="/dashboard/viktmal" className="text-xs text-accent hover:underline mt-1.5 inline-block">
            Ditt viktmål: {deficitSummary.avgDiffKcal > 0 ? '+' : ''}{deficitSummary.avgDiffKcal} kcal/dag i snitt →
          </a>
        )}
      </div>

      {/* Inställningar — flyttat hit från Profil, samma pilotmönster som
          Viktmål (Daniel: "slå på funktionen där, sen ställer man in allt
          annat från sidan"). Endast av/på-växeln ("Spåra mål på
          Kost-sidan") bor kvar i Profil. Ihopfälld som standard eftersom
          Kost, till skillnad från Viktmål, inte kräver någon obligatorisk
          uppsättning innan sidan är användbar. */}
      {kostSettings.trackingEnabled && (
        <div className="bg-card border border-edge rounded-2xl p-4">
          <button type="button" onClick={() => setSettingsOpen(v => !v)} className="flex items-center justify-between w-full">
            <span className="text-xs text-muted uppercase tracking-wider">Inställningar</span>
            <span className="text-muted text-xs">{settingsOpen ? '▾' : '▸'}</span>
          </button>
          {settingsOpen && (
            <div className="mt-4 pt-4 border-t border-edge">
              <KostSettingsCard
                key={settingsResyncKey}
                userId={userId}
                trackedMetrics={kostSettings.trackedMetrics}
                trackedMeals={kostSettings.trackedMeals}
                remindersEnabled={kostSettings.remindersEnabled}
                eveningGuardEnabled={kostSettings.eveningGuardEnabled}
                eveningGuardHour={kostSettings.eveningGuardHour}
                proteinGoalG={kostSettings.proteinGoalG}
                proteinGoalMode={kostSettings.proteinGoalMode}
                carbGoalG={kostSettings.carbGoalG}
                fatGoalG={kostSettings.fatGoalG}
                hasCalorieGoal={dailyCalorieGoal != null}
              />
            </div>
          )}
        </div>
      )}

      {/* Upplägg-förslag — Daniel: "kanske få upp ett tips eller något på
          minimalt kcal upplägg... och ett maxat, men ändå under plan.
          Baserat på de man ätit." Två AI-förslag för RESTEN av dagen,
          byggda enbart av egna quick picks (aldrig påhittade rätter). */}
      {kostSettings.calorieGoal != null && (
        <div className="bg-card border border-edge rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs text-muted uppercase tracking-wider">🍽️ Upplägg för resten av dagen</span>
            {!planLoading && (
              <button
                type="button"
                onClick={getPlanSuggestion}
                className="text-xs bg-bg border border-edge px-3 py-1.5 rounded-lg text-fg hover:border-accent transition-colors"
              >
                {planSuggestion ? 'Uppdatera' : '✨ Föreslå'}
              </button>
            )}
          </div>
          {planLoading && <p role="status" className="text-muted text-xs">Tar fram förslag…</p>}
          {planError && <p role="alert" className="text-red-400 text-xs">{planError}</p>}
          {!planLoading && !planError && !planSuggestion && (
            <p className="text-muted text-xs">Två färdiga förslag för resten av dagen, byggda av dina egna vanligaste rätter — ett minimalt och ett som maxar ut det du har kvar.</p>
          )}
          {planSuggestion && (
            <div className="flex flex-col gap-3">
              <p className="text-muted text-xs">
                Kvar idag: <span className="font-mono text-fg">{planSuggestion.remainingKcal} kcal</span>
                {planSuggestion.remainingProteinG != null && <span> · <span className="font-mono text-fg">{Math.round(planSuggestion.remainingProteinG)}g</span> protein</span>}
              </p>
              {([{ key: 'minimal', label: 'Minimalt', option: planSuggestion.minimal }, { key: 'maxed', label: 'Maxat', option: planSuggestion.maxed }] as const).map(({ key, label, option }) => (
                <div key={key} className="bg-bg rounded-xl p-3">
                  <div className="text-sm font-semibold mb-0.5">{label}</div>
                  <p className="text-muted text-xs mb-2">{option.note}</p>
                  <div className="flex flex-col gap-1">
                    {option.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-fg">{item.name}{item.portion ? <span className="text-muted"> · {item.portion}</span> : null}</span>
                        <span className="font-mono text-muted flex-shrink-0 ml-2">{item.kcal} kcal · {Math.round(item.proteinG)}g</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-edge font-mono">
                    <span className="text-fg font-semibold">Totalt</span>
                    <span className="text-fg font-semibold">{option.totalKcal} kcal · {Math.round(option.totalProteinG)}g protein</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
              {yazioSyncing ? 'Synkar…' : 'Synka nu'}
            </button>
          </div>
          {yazioSyncMsg && <div role="status" className="text-xs text-lcd">{yazioSyncMsg}</div>}
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-accent text-2xl font-bold">
              {yazioToday.kcalEaten ?? 0}
              {yazioToday.kcalGoal != null && <span className="text-muted text-sm font-normal"> / {yazioToday.kcalGoal} kcal</span>}
            </span>
          </div>
          {yazioToday.kcalGoal != null && (
            <div className="w-full h-1.5 bg-bg rounded-full overflow-hidden -mt-1.5">
              <div className="h-full bg-accent rounded-full transition-[width]" style={{ width: `${Math.min(100, Math.round(((yazioToday.kcalEaten ?? 0) / yazioToday.kcalGoal) * 100))}%` }} />
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
                const burned = !isFuture && day?.kcalEaten != null ? burnedKcalForDate(key) : null
                const status = diff != null && burned != null && day?.kcalGoal != null && day?.kcalEaten != null
                  ? dayCalorieStatus(day.kcalEaten, day.kcalGoal, burnedKcalForStatus(key)) : null
                return (
                  <div key={key} className={`flex items-center justify-between text-xs py-1.5 ${isFuture ? 'opacity-40' : ''}`}>
                    <span className={`capitalize ${isToday ? 'text-fg font-medium' : 'text-muted'}`}>{label}</span>
                    {day?.kcalEaten != null ? (
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-fg">{day.kcalEaten} kcal</span>
                        {burned != null && <span className="text-muted">/ {burned} bränt</span>}
                        {diff != null && (
                          <span className={status ? DAY_CALORIE_STATUS_TEXT_COLOR[status] : 'text-accent'}>
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
                {feedbackLoading ? 'Tänker…' : '✨ Få feedback på dagens mat & veckans progress'}
              </button>
            )}
            {feedbackError && <p role="alert" className="text-red-400 text-xs mt-2">{feedbackError}</p>}
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
            {todayTotal} {dailyCalorieGoal ? <span className="text-muted text-sm font-normal">/ {dailyCalorieGoal} kcal{calorieGoalSource === 'deficit_budget' ? ' · Viktmål' : ''}</span> : <span className="text-muted text-sm font-normal">kcal</span>}
          </span>
        </div>
        {goalPct != null && (
          <div className="w-full h-1.5 bg-bg rounded-full overflow-hidden mb-1">
            <div className="h-full bg-accent rounded-full transition-[width]" style={{ width: `${goalPct}%` }} />
          </div>
        )}
        {!dailyCalorieGoal && (
          <p className="text-muted text-xs mt-1">
            Inget kalorimål satt — <a href="/dashboard/profil" className="text-accent hover:underline">ange ett i Profil</a> för att se det som en budget.
          </p>
        )}
        {/* Protein — samma visuella vikt som kalorierna ovan, inte en liten
            rad eller en av tre likvärdiga rutor (Daniel: "lika synligt som
            kalorier"). Visas alltid när något är loggat, oavsett om
            Kost-mål är påslaget. */}
        {todayProtein > 0 && (
          <div className="mt-3 pt-3 border-t border-edge">
            <div className="flex items-baseline justify-between">
              <span className="text-muted text-xs">Protein idag</span>
              <span className="font-mono text-accent text-lg font-bold">
                {Math.round(todayProtein)} {kostSettings.proteinGoalG ? <span className="text-muted text-sm font-normal">/ {kostSettings.proteinGoalG} g mål</span> : <span className="text-muted text-sm font-normal">g</span>}
              </span>
            </div>
            {kostSettings.proteinGoalG && (
              <div className="w-full h-1.5 bg-bg rounded-full overflow-hidden mt-1">
                <div className="h-full bg-accent rounded-full transition-[width]" style={{ width: `${Math.min(100, Math.round((todayProtein / kostSettings.proteinGoalG) * 100))}%` }} />
              </div>
            )}
          </div>
        )}
        {kostSettings.trackingEnabled && (() => {
          const shownMetrics = (['carb', 'fat'] as const).filter(m => kostSettings.trackedMetrics.includes(m))
          if (shownMetrics.length === 0) return null
          return (
            <div className="grid gap-2 mt-3 pt-3 border-t border-edge text-center" style={{ gridTemplateColumns: `repeat(${shownMetrics.length}, minmax(0, 1fr))` }}>
              {shownMetrics.map(m => {
                const total = metricTotalForDay(todayEntries, m)
                const goal = m === 'carb' ? kostSettings.carbGoalG : kostSettings.fatGoalG
                return (
                  <div key={m} className="bg-bg rounded-lg py-2">
                    <div className="font-mono text-fg text-sm font-bold">
                      {Math.round(total)}{goal != null && <span className="text-muted font-normal"> / {goal}</span>}g
                    </div>
                    <div className="text-muted text-[10px] mt-0.5">{kostMetricLabel(m)}</div>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {kostSettings.trackingEnabled ? (
          <div className="mt-3 pt-3 border-t border-edge flex flex-col">
            {KOST_MEALS.map(meal => {
              const isTracked = kostSettings.trackedMeals.includes(meal)
              const group = todayGroups[meal]
              const groupKcal = group.reduce((s, e) => s + e.calories, 0)
              const isOpen = openMealGroups.has(meal) || (group.length > 1)
              if (!isTracked && group.length === 0) return null
              return (
                <div key={meal} className="border-b border-edge last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOpenMealGroups(prev => {
                      const n = new Set(prev)
                      if (n.has(meal)) n.delete(meal); else n.add(meal)
                      return n
                    })}
                    className="w-full flex items-center justify-between py-2.5 text-left"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${group.length > 0 ? 'bg-accent' : isTracked ? 'bg-red-400' : 'bg-muted'}`} />
                      {kostMealLabel(meal)}
                      {group.length > 1 && <span className="text-[10px] bg-edge text-muted rounded-full px-1.5 py-0.5 font-mono">{group.length}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      {group.length > 0
                        ? <span className="font-mono text-fg text-sm">{groupKcal} kcal</span>
                        : isTracked ? <span className="text-red-400 text-xs">ej loggat</span> : <span className="text-muted text-xs">–</span>}
                      {group.length > 0 && <span className="text-muted text-[10px]">{isOpen ? '▾' : '▸'}</span>}
                    </span>
                  </button>
                  {isOpen && group.length > 0 && (
                    <div className="pb-3 pl-4 flex flex-col gap-1.5">
                      {group.map(e => (
                        <div key={e.id} className="flex items-center justify-between text-xs">
                          <span className="text-muted break-words pr-2">{e.name}</span>
                          <span className="font-mono text-fg flex items-center gap-1.5 flex-shrink-0">
                            {e.calories} kcal{macroSuffix(e) && <span className="text-muted"> · {macroSuffix(e)}</span>}
                            <button onClick={() => startEdit(e)} className="text-muted hover:text-accent transition-colors px-1">✎</button>
                            <button onClick={() => deleteEntry(e.id)} className="text-muted hover:text-red-400 transition-colors px-1">✕</button>
                          </span>
                        </div>
                      ))}
                      {MULTI_ENTRY_MEALS.has(meal) && (
                        <button onClick={() => openLogFlow(meal)} className="self-start text-[11px] border border-dashed border-edge rounded-lg px-2.5 py-1.5 text-muted hover:text-accent hover:border-accent/40 transition-colors mt-1">
                          + Logga ännu {meal === 'snack' ? 'ett mellanmål' : 'en kvällsmat'}
                        </button>
                      )}
                    </div>
                  )}
                  {group.length === 0 && (
                    <div className="pb-3">
                      <button onClick={() => openLogFlow(meal)} className="text-[11px] border border-dashed border-edge rounded-lg px-2.5 py-1.5 text-muted hover:text-accent hover:border-accent/40 transition-colors">
                        + Logga {kostMealLabel(meal).toLowerCase()}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {unmatchedTodayEntries.length > 0 && (
              <div className="border-b border-edge last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpenMealGroups(prev => {
                    const n = new Set(prev)
                    if (n.has('_unmatched')) n.delete('_unmatched'); else n.add('_unmatched')
                    return n
                  })}
                  className="w-full flex items-center justify-between py-2.5 text-left"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-amber-400" />
                    Otaggat
                    <span className="text-[10px] bg-edge text-muted rounded-full px-1.5 py-0.5 font-mono">{unmatchedTodayEntries.length}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-fg text-sm">{unmatchedTodayEntries.reduce((s, e) => s + e.calories, 0)} kcal</span>
                    <span className="text-muted text-[10px]">{openMealGroups.has('_unmatched') ? '▾' : '▸'}</span>
                  </span>
                </button>
                {openMealGroups.has('_unmatched') && (
                  <div className="pb-3 pl-4 flex flex-col gap-1.5">
                    <p className="text-muted text-[11px] -mt-0.5 mb-0.5">Loggat innan måltidsval fanns — tryck ✎ för att tagga.</p>
                    {unmatchedTodayEntries.map(e => (
                      <div key={e.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted break-words pr-2">{e.name}</span>
                        <span className="font-mono text-fg flex items-center gap-1.5 flex-shrink-0">
                          {e.calories} kcal{macroSuffix(e) && <span className="text-muted"> · {macroSuffix(e)}</span>}
                          <button onClick={() => startEdit(e)} className="text-muted hover:text-accent transition-colors px-1">✎</button>
                          <button onClick={() => deleteEntry(e.id)} className="text-muted hover:text-red-400 transition-colors px-1">✕</button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          todayEntries.length > 0 && (
            <div className="flex flex-col gap-1 mt-3">
              {todayEntries.map(e => (
                <div key={e.id} className="flex items-center justify-between gap-2 text-sm bg-bg rounded-lg px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-fg break-words">{e.name}</span>
                    <span className="text-muted text-xs ml-2 whitespace-nowrap">{fmtTime(e.logged_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-mono text-muted whitespace-nowrap">{e.calories} kcal{macroSuffix(e) && ` · ${macroSuffix(e)}`}</span>
                    <button onClick={() => startEdit(e)} className="text-muted hover:text-accent transition-colors text-xs px-1">✎</button>
                    <button onClick={() => deleteEntry(e.id)} className="text-muted hover:text-red-400 transition-colors text-xs px-1">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <button type="button" onClick={() => openLogFlow(null)} className="bg-accent text-bg font-semibold py-3 rounded-2xl text-sm hover:opacity-90 transition-opacity">
        + Logga mat
      </button>

      {/* Snabbval */}
      {sortedQuickPicks.length > 0 && (
        <div className="bg-card border border-edge rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Snabbval</span>
            <span className="text-[10px] text-muted">⭐ fäst överst · ✕ ta bort</span>
          </div>
          <div className="flex flex-col">
            {visibleQuickPicks.map(p => (
              <div key={p.name} className="flex items-center gap-2 py-2 border-b border-edge last:border-b-0 text-xs">
                <button
                  onClick={() => handleQuickPickTap(p)}
                  disabled={logging}
                  className="flex-1 min-w-0 text-left text-fg hover:text-accent transition-colors disabled:opacity-50"
                >
                  <span className="block truncate">{p.pinned && '⭐ '}{p.name}</span>
                  <span className="block text-[11px] text-muted">
                    {quickPickMacroText(p).kcal} · <span className={quickPickMacroText(p).proteinKnown ? '' : 'italic'}>{quickPickMacroText(p).protein}</span>
                  </span>
                </button>
                <button onClick={() => toggleFavorite(p.name)} className={`w-6 h-6 rounded-md border text-[11px] flex items-center justify-center flex-shrink-0 ${p.pinned ? 'border-amber-500/50 text-amber-400' : 'border-edge text-muted hover:text-fg'}`}>⭐</button>
                <button onClick={() => removeQuickPick(p.name)} className="w-6 h-6 rounded-md border border-edge text-muted hover:border-red-400 hover:text-red-400 transition-colors text-[11px] flex items-center justify-center flex-shrink-0">✕</button>
              </div>
            ))}
          </div>
          {sortedQuickPicks.length > QUICK_PICKS_COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setQuickPicksExpanded(v => !v)}
              className="w-full text-center text-xs text-accent hover:underline mt-3 pt-2"
            >
              {quickPicksExpanded ? 'Visa färre' : `Visa fler (${sortedQuickPicks.length - QUICK_PICKS_COLLAPSED_COUNT} till)`}
            </button>
          )}
        </div>
      )}

      {/* Vecka / Kalender — bara relevant när kost-mål är påslaget */}
      {kostSettings.trackingEnabled && (
        <>
          <div className="flex gap-2">
            <button onClick={() => setKostView('week')} className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-colors ${kostView === 'week' ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-card border-edge text-muted'}`}>Vecka</button>
            <button onClick={() => setKostView('calendar')} className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-colors ${kostView === 'calendar' ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-card border-edge text-muted'}`}>Kalender</button>
          </div>

          {kostView === 'week' && (
            <div className="bg-card border border-edge rounded-2xl p-4">
              <div className="text-xs text-muted uppercase tracking-wider mb-2">Veckans loggade dagar</div>
              <div className="flex flex-col">
                {weekKeys.map(key => {
                  const dayEntries = entriesByDate.get(key) ?? []
                  const isFuture = key > todayKey
                  const isToday = key === todayKey
                  const label = new Date(`${key}T00:00:00`).toLocaleDateString('sv-SE', { weekday: 'short' })
                  const completeness = computeDayCompleteness(kostSettings.trackedMeals, dayEntries, dayOverrides.has(key))
                  const kcal = kcalTotalForDay(dayEntries)
                  const diff = kostSettings.calorieGoal != null ? kcal - kostSettings.calorieGoal : null
                  const burned = !isFuture && completeness.status === 'complete' ? burnedKcalForDate(key) : null
                  // Ätit vs förbränt den dagen — Daniel: "diff mot dagens
                  // förbränning och mat... lär ju äta mer en dag man
                  // tränar mycket". Skiljer sig från diff-mot-mål ovan (som
                  // jämför mot Viktmål-budgeten) — den här visar rakt av om
                  // dagen gav ett överskott eller underskott, oavsett
                  // budget, samma modell (och färgkonvention: överskott =
                  // amber, underskott/jämnt = grönt) som "Kalorier idag" på
                  // Översikt.
                  const netDiff = burned != null ? kcal - burned : null
                  const status = kostSettings.calorieGoal != null && burned != null
                    ? dayCalorieStatus(kcal, kostSettings.calorieGoal, burnedKcalForStatus(key)) : null
                  return (
                    <button
                      key={key}
                      onClick={() => !isFuture && setSelectedDay(key)}
                      disabled={isFuture}
                      className={`flex items-center justify-between text-xs py-1.5 text-left ${isFuture ? 'opacity-40' : ''}`}
                    >
                      <span className={`capitalize ${isToday ? 'text-fg font-medium' : 'text-muted'}`}>{label}</span>
                      {isFuture ? (
                        <span className="text-muted">–</span>
                      ) : completeness.status === 'no_data' ? (
                        <span className="text-red-400">Ingen data</span>
                      ) : completeness.status === 'incomplete' ? (
                        <span className="text-amber-400">⚠ Saknar {completeness.missingMeals.map(kostMealLabel).join(', ')}</span>
                      ) : (
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="flex items-center gap-2 font-mono">
                            <span className="text-fg">{kcal} kcal</span>
                            {burned != null && <span className="text-muted">/ {burned} bränt</span>}
                            {diff != null && <span className={status ? DAY_CALORIE_STATUS_TEXT_COLOR[status] : 'text-accent'}>{diff > 0 ? '+' : ''}{diff}</span>}
                          </span>
                          {netDiff != null && (
                            <span className={`text-[10px] font-mono ${netDiff > 0 ? 'text-amber-500' : 'text-green-400'}`}>
                              {netDiff > 0 ? '+' : ''}{netDiff} vs bränt
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {kostView === 'calendar' && (() => {
            // Nettodiff denna månad (Daniel: "summan av diffen på
            // månadsbasis kanske räcker" — istället för en förbränt-siffra
            // per dag i den redan trånga kalenderrutan) — summerar ätit
            // minus förbränt över dagar med komplett loggning hittills i
            // den visade månaden. Använder burnedKcalForStatus (den
            // försiktiga, Garmin-korrigerade siffran) precis som
            // dayCalorieStatus nedan — det här är samma typ av "gick jag
            // faktiskt framåt"-bedömning, bara summerad över månaden.
            let monthNetDiffSum = 0
            let monthNetDiffDays = 0
            for (let day = 1; day <= calDays.daysInMonth; day++) {
              const key = dateKeyFor(calDays.year, calDays.month, day)
              if (key > todayKey) continue
              const dayEntries = entriesByDate.get(key) ?? []
              const completeness = computeDayCompleteness(kostSettings.trackedMeals, dayEntries, dayOverrides.has(key))
              if (completeness.status !== 'complete') continue
              monthNetDiffSum += kcalTotalForDay(dayEntries) - burnedKcalForStatus(key)
              monthNetDiffDays++
            }

            return (
            <div className="bg-card border border-edge rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">{new Date(calDays.year, calDays.month, 1).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })}</span>
                <div className="flex gap-1.5">
                  <button onClick={() => setCalMonthOffset(o => o - 1)} className="w-7 h-7 rounded-lg border border-edge text-muted hover:text-fg">‹</button>
                  <button onClick={() => setCalMonthOffset(o => Math.min(0, o + 1))} disabled={calMonthOffset >= 0} className="w-7 h-7 rounded-lg border border-edge text-muted hover:text-fg disabled:opacity-30">›</button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {['M', 'T', 'O', 'T', 'F', 'L', 'S'].map(d => <div key={d} className="text-center text-[10px] text-muted pb-1">{d}</div>)}
                {Array.from({ length: calDays.firstDow }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: calDays.daysInMonth }).map((_, i) => {
                  const day = i + 1
                  const key = dateKeyFor(calDays.year, calDays.month, day)
                  const isFuture = key > todayKey
                  const dayEntries = entriesByDate.get(key) ?? []
                  const completeness = computeDayCompleteness(kostSettings.trackedMeals, dayEntries, dayOverrides.has(key))
                  const kcal = kcalTotalForDay(dayEntries)
                  const flagged = !isFuture && (completeness.status === 'incomplete' || completeness.status === 'no_data')
                  let bg = 'bg-bg text-muted'
                  if (!isFuture && completeness.status === 'complete') {
                    bg = kostSettings.calorieGoal != null
                      ? DAY_CALORIE_STATUS_BG[dayCalorieStatus(kcal, kostSettings.calorieGoal, burnedKcalForStatus(key))]
                      : 'bg-accent/10 text-fg'
                  }
                  return (
                    <button
                      key={key}
                      onClick={() => !isFuture && setSelectedDay(key)}
                      disabled={isFuture}
                      className={`aspect-square rounded-lg flex items-center justify-center text-[11px] font-mono relative ${bg} ${flagged ? 'border border-red-400/60' : 'border border-transparent'} ${isFuture ? 'opacity-30' : ''} ${key === todayKey ? 'ring-1 ring-fg' : ''}`}
                    >
                      {day}
                      {flagged && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-400" />}
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-muted">
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm inline-block bg-green-400/60" />Klarar budget</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm inline-block bg-amber-500/60" />Under förbränning</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm inline-block bg-red-400/60" />Över förbränning</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm inline-block bg-edge" />Ingen/lite data</span>
                <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full" style={{ background: RED }} />Flaggad</span>
              </div>
              {monthNetDiffDays > 0 && (
                <div className="text-xs text-muted mt-3 pt-3 border-t border-edge">
                  Nettodiff denna månad: <span className={`font-mono ${monthNetDiffSum > 0 ? 'text-red-400' : 'text-green-400'}`}>{monthNetDiffSum > 0 ? '+' : ''}{monthNetDiffSum} kcal</span>
                  {' '}({monthNetDiffDays} {monthNetDiffDays === 1 ? 'dag' : 'dagar'} med data)
                </div>
              )}
            </div>
            )
          })()}
        </>
      )}

      {/* Logga mat-drawer */}
      {logOpen && (
        <Modal label="Logga mat" placement="bottom" panelClassName="max-h-[85vh]" onClose={closeLogFlow}>
            <div className="w-9 h-1 bg-edge rounded-full mx-auto mb-4" />
            <div className="text-base font-bold mb-0.5">Logga mat</div>
            <p className="text-muted text-xs mb-4">{fmtDateLabel(logDate)}</p>

            {kostSettings.trackingEnabled && (
              <div className="flex flex-wrap gap-2 mb-4">
                {KOST_MEALS.map(m => (
                  <button
                    key={m}
                    onClick={() => setLogMeal(m)}
                    className={`text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${logMeal === m ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-fg hover:border-accent/30'}`}
                  >
                    {kostMealLabel(m)}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 mb-4">
              {(['dish', 'label', 'search', 'text'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setLogMethod(m); clearFlow() }}
                  className={`flex-1 min-w-[46%] text-xs font-semibold px-2 py-2 rounded-xl border transition-colors ${logMethod === m ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-muted'}`}
                >
                  {m === 'dish' ? '📷 Fota rätt' : m === 'label' ? '🏷️ Fota etikett' : m === 'search' ? '🔍 Sök' : '✍️ Skriv'}
                </button>
              ))}
            </div>

            {(logMethod === 'dish' || logMethod === 'label') && !estimate && (
              <div className="flex flex-col gap-3">
                <p className="text-muted text-xs">
                  {logMethod === 'label'
                    ? 'Fota näringsvärdesetiketten på förpackningen — ger mer exakta siffror än en gissning på rätten.'
                    : 'Fota rätten. Lägg gärna till fler bilder (t.ex. från ovan + en etikett) för säkrare analys.'}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {logPhotos.map((p, i) => (
                    <div key={i} className="w-16 h-16 rounded-xl bg-bg border border-edge flex items-center justify-center text-xl relative overflow-hidden">
                      <img src={`data:${p.mimeType};base64,${p.data}`} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                  {logPhotos.length < MAX_LOG_PHOTOS && (
                    <button onClick={() => fileInputRef.current?.click()} className="w-16 h-16 rounded-xl border border-dashed border-edge text-muted hover:border-accent hover:text-accent transition-colors text-xl">+</button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={e => { if (e.target.files?.length) onPhotosSelected(e.target.files); e.target.value = '' }}
                />
                <input
                  type="text"
                  aria-label="Extra info till AI:n" value={logPhotoNote}
                  onChange={e => setLogPhotoNote(e.target.value)}
                  placeholder="Extra info till AI:n (valfritt), t.ex. &quot;dubbel portion pasta&quot;"
                  className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
                />
                <button
                  onClick={analyzePhotos}
                  disabled={logPhotos.length === 0 || estimating}
                  className="bg-accent text-bg font-semibold py-3 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {estimating ? 'Analyserar…' : `✨ Analysera${logPhotos.length > 1 ? ` (${logPhotos.length} bilder)` : ''}`}
                </button>
              </div>
            )}

            {logMethod === 'search' && !selectedCandidate && (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  aria-label="Sök livsmedel" value={query}
                  onChange={e => { setQuery(e.target.value); setSelectedCandidate(null); setEstimate(null) }}
                  placeholder="Sök t.ex. hamburgare…"
                  className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
                />
                {searching && <p role="status" className="text-muted text-xs">Söker…</p>}
                {visibleCandidates && visibleCandidates.length > 0 && (
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
                {visibleCandidates && visibleCandidates.length === 0 && query.trim().length >= 2 && !searching && (
                  <p className="text-muted text-xs">Hittade inget i livsmedelsdatabasen för &quot;{query.trim()}&quot;. Prova &quot;Skriv&quot; istället.</p>
                )}
              </div>
            )}

            {logMethod === 'text' && !estimate && (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  aria-label="Beskriv vad du åt" value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="T.ex. 'två skivor rostat bröd med ost och skinka'"
                  className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
                />
                <button
                  onClick={estimateFromText}
                  disabled={estimating || !query.trim()}
                  className="bg-accent text-bg font-semibold py-3 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {estimating ? 'Uppskattar…' : '✨ Uppskatta'}
                </button>
              </div>
            )}

            {selectedCandidate && (
              <div className="flex flex-col gap-3">
                <div className="text-sm text-fg">{selectedCandidate.name}</div>
                <div>
                  <label htmlFor="foodlogclient-f1" className="text-muted text-xs block mb-1.5">Mängd (gram)</label>
                  <input id="foodlogclient-f1"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={grams}
                    onChange={e => setGrams(e.target.value)}
                    className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
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
                      className="text-xs bg-accent text-bg font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                    >
                      {logging ? 'Loggar…' : 'Logga'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {estimate && (
              <div className="flex flex-col gap-3">
                {logMethod !== 'search' && (
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
                )}
                <span className="inline-flex items-center gap-1.5 text-[11px] text-accent bg-accent/10 rounded-full px-3 py-1 self-start">
                  ✨ {logMethod === 'label' ? 'Läst från etikett' : estimate.source === 'photo' ? 'AI-uppskattat från bild' : 'AI-uppskattat'} — redigera gärna innan du sparar
                </span>
                <div>
                  <label htmlFor="foodlogclient-f2" className="text-muted text-xs block mb-1.5">Namn</label>
                  <input id="foodlogclient-f2" value={resultName} onChange={e => setResultName(e.target.value)} className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="foodlogclient-f3" className="text-muted text-xs block mb-1.5">Kalorier (kcal)</label>
                    <input id="foodlogclient-f3" type="number" value={resultKcal} onChange={e => setResultKcal(e.target.value)} className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg font-mono focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label htmlFor="foodlogclient-f4" className="text-muted text-xs block mb-1.5">Protein (g)</label>
                    <input id="foodlogclient-f4" type="number" value={resultProtein} onChange={e => setResultProtein(e.target.value)} className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg font-mono focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label htmlFor="foodlogclient-f5" className="text-muted text-xs block mb-1.5">Kolhydrater (g)</label>
                    <input id="foodlogclient-f5" type="number" value={resultCarb} onChange={e => setResultCarb(e.target.value)} className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg font-mono focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label htmlFor="foodlogclient-f6" className="text-muted text-xs block mb-1.5">Fett (g)</label>
                    <input id="foodlogclient-f6" type="number" value={resultFat} onChange={e => setResultFat(e.target.value)} className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg font-mono focus:outline-none focus:border-accent" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={clearFlow} className="flex-1 text-xs text-muted border border-edge rounded-lg py-2.5">Avbryt</button>
                  <button
                    onClick={logEstimate}
                    disabled={logging}
                    className="flex-1 text-xs bg-accent text-bg font-semibold py-2.5 rounded-lg disabled:opacity-50"
                  >
                    {logging ? 'Sparar…' : 'Spara i loggen'}
                  </button>
                </div>
              </div>
            )}

            {error && <p role="alert" className="text-red-400 text-xs mt-3">{error}</p>}
            <button onClick={closeLogFlow} className="text-muted text-xs mt-4 w-full text-center">Stäng</button>
        </Modal>
      )}

      {/* Redigera-post-modal */}
      {editingId && (
        <EditEntryDialog
          trackingEnabled={kostSettings.trackingEnabled}
          name={editName} onNameChange={setEditName}
          kcal={editKcal} onKcalChange={setEditKcal}
          protein={editProtein} onProteinChange={setEditProtein}
          carb={editCarb} onCarbChange={setEditCarb}
          fat={editFat} onFatChange={setEditFat}
          meal={editMeal} onMealChange={setEditMeal}
          saving={editSaving}
          onSave={saveEdit}
          onClose={() => setEditingId(null)}
        />
      )}

      {/* Dag-detalj-drawer (kalender/vecka) */}
      {selectedDay && (
        <DayDetailDialog
          day={selectedDay}
          entriesByDate={entriesByDate}
          kostSettings={kostSettings}
          dayOverrides={dayOverrides}
          yazioByDate={yazioByDate}
          todayKey={todayKey}
          deficitSummary={deficitSummary}
          dayNotes={dayNotes}
          onClose={() => setSelectedDay(null)}
          onLogForDay={(dateKey, meal) => { setSelectedDay(null); openLogFlow(meal, dateKey) }}
          onEditEntry={e => { setSelectedDay(null); startEdit(e) }}
          onMarkComplete={markDayComplete}
          onSaveNote={saveDayNote}
        />
      )}

      {quickPickConfirm && (
        <QuickPickDialog
          confirmState={quickPickConfirm}
          setConfirmState={setQuickPickConfirm}
          trackedMeals={kostSettings.trackedMeals}
          latestTodayEntryId={todayEntries[0]?.id}
          logging={logging}
          onLog={logQuickPick}
          onUpdateValues={updateQuickPickValues}
          onClose={() => setQuickPickConfirm(null)}
        />
      )}
      </>
      )}
    </div>
  )
}
