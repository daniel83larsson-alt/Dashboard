'use client'

import { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ChipPicker, COMMON_EQUIPMENT, COMMON_SPORTS } from '@/components/ChipPicker'
import { COACH_TONE_LABELS, type CoachTone } from '@/lib/coach-tone'
import { KOST_METRICS, KOST_MEALS, kostMetricLabel, kostMealLabel, type KostMetric, type KostMeal } from '@/lib/kost'
import { estimateBMR } from '@/lib/bmr'
import { computeDeficitBudget, deficitOverrideSignature, safetyBreachLabel } from '@/lib/deficit'

type FlagEntry = { at: string; reason: string; snippet: string }

// Native <input type="number"> is unreliable across browsers/keyboards for
// a Swedish decimal comma ("105,2") — some simply refuse the character.
// These decimal fields use type="text" instead and normalize the comma
// themselves so parseFloat (which only understands ".") always works.
function normalizeDecimalInput(raw: string): string {
  return raw.replace(',', '.')
}

type Profile = {
  id: string
  name?: string | null
  llm_api_key_encrypted?: string | null
  llm_provider?: string | null
  locked?: boolean | null
  flagged_attempts?: number | null
  flag_log?: FlagEntry[] | null
  home_equipment?: string[] | null
  selected_sports?: string[] | null
  daily_step_goal?: number | null
  weight_kg?: number | null
  weekly_load_goal?: number | null
  height_cm?: number | null
  birth_year?: number | null
  biological_sex?: 'male' | 'female' | null
  daily_calorie_goal?: number | null
  weekly_digest_opt_out?: boolean | null
  coach_tone?: string | null
  kost_tracking_enabled?: boolean | null
  kost_tracked_metrics?: string[] | null
  kost_tracked_meals?: string[] | null
  kost_reminders_enabled?: boolean | null
  kost_evening_guard_enabled?: boolean | null
  kost_evening_guard_hour?: number | null
  protein_goal_g?: number | null
  carb_goal_g?: number | null
  fat_goal_g?: number | null
  deficit_tracking_enabled?: boolean | null
  deficit_budget_kcal?: number | null
  deficit_start_weight_kg?: number | null
  deficit_start_date?: string | null
  deficit_target_weight_kg?: number | null
  deficit_target_date?: string | null
  deficit_neat_factor?: number | null
  deficit_activity_fallback_kcal?: number | null
  deficit_garmin_correction?: number | null
  deficit_weigh_in_weekday?: number | null
  deficit_reminders_enabled?: boolean | null
  deficit_override_acknowledged_at?: string | null
  deficit_override_signature?: string | null
}


const CONTEXT_PLACEHOLDER = `Beskriv dig själv, din situation och din träning — ju mer bakgrund, desto bättre feedback.

Exempel:
- Jag tränar 3-4 gånger/vecka, mestadels 20-30 min pass
- Jobb: stillasittande kontorsjobb, pendlar 1h/dag — påverkar när jag orkar träna
- Personlighet: tävlingsinriktad, blir lätt uttråkad av för lugna pass
- Mål: förbättra mitt personbästa på en standarddistans
- Vill bygga aerob bas, hålla pulsen nere på längre pass
- Skador/begränsningar: ont i vänster axel ibland vid högintensiva pass`

export default function ProfileForm({
  profile,
  userEmail,
  hasConcept2,
  hasGarmin,
  hasStrava,
  hasPolar,
  hasYazio,
  concept2Synced,
  garminSynced,
  stravaSynced,
  polarSynced,
  yazioSynced,
  savedContext,
  avgTrainingKcalRaw,
}: {
  profile: Profile | null
  userEmail: string
  hasConcept2: boolean
  hasGarmin: boolean
  hasStrava: boolean
  hasPolar: boolean
  hasYazio: boolean
  concept2Synced: boolean
  garminSynced: boolean
  stravaSynced: boolean
  polarSynced: boolean
  yazioSynced: boolean
  savedContext: string
  avgTrainingKcalRaw: number | null
}) {
  const [name, setName] = useState(profile?.name ?? '')
  const [apiKey, setApiKey] = useState('')
  const [provider, setProvider] = useState(profile?.llm_provider ?? 'gemini')
  const [context, setContext] = useState(savedContext)
  const [equipment, setEquipment] = useState<string[]>(profile?.home_equipment ?? [])
  const [sports, setSports] = useState<string[]>(profile?.selected_sports ?? [])
  const [stepGoal, setStepGoal] = useState(profile?.daily_step_goal ?? 10000)
  const [weightKg, setWeightKg] = useState(profile?.weight_kg?.toString() ?? '')
  const [loadGoal, setLoadGoal] = useState(profile?.weekly_load_goal?.toString() ?? '')
  const [heightCm, setHeightCm] = useState(profile?.height_cm?.toString() ?? '')
  const [birthYear, setBirthYear] = useState(profile?.birth_year?.toString() ?? '')
  const [biologicalSex, setBiologicalSex] = useState(profile?.biological_sex ?? '')
  const [calorieGoal, setCalorieGoal] = useState(profile?.daily_calorie_goal?.toString() ?? '')
  const [kostTrackingEnabled, setKostTrackingEnabled] = useState(profile?.kost_tracking_enabled ?? false)
  const [kostTrackedMetrics, setKostTrackedMetrics] = useState<KostMetric[]>((profile?.kost_tracked_metrics as KostMetric[] | null) ?? ['kcal'])
  const [kostTrackedMeals, setKostTrackedMeals] = useState<KostMeal[]>((profile?.kost_tracked_meals as KostMeal[] | null) ?? ['breakfast', 'lunch', 'dinner'])
  const [kostRemindersEnabled, setKostRemindersEnabled] = useState(profile?.kost_reminders_enabled ?? true)
  const [eveningGuardEnabled, setEveningGuardEnabled] = useState(profile?.kost_evening_guard_enabled ?? false)
  const [eveningGuardHour, setEveningGuardHour] = useState(profile?.kost_evening_guard_hour ?? 20)
  const [proteinGoalG, setProteinGoalG] = useState(profile?.protein_goal_g?.toString() ?? '')
  const [carbGoalG, setCarbGoalG] = useState(profile?.carb_goal_g?.toString() ?? '')
  const [fatGoalG, setFatGoalG] = useState(profile?.fat_goal_g?.toString() ?? '')
  const [deficitTrackingEnabled, setDeficitTrackingEnabled] = useState(profile?.deficit_tracking_enabled ?? false)
  const [deficitStartWeightKg, setDeficitStartWeightKg] = useState(profile?.deficit_start_weight_kg?.toString() ?? profile?.weight_kg?.toString() ?? '')
  const [deficitTargetWeightKg, setDeficitTargetWeightKg] = useState(profile?.deficit_target_weight_kg?.toString() ?? '')
  const [deficitTargetDate, setDeficitTargetDate] = useState(profile?.deficit_target_date ?? '')
  const [deficitNeatFactor, setDeficitNeatFactor] = useState(profile?.deficit_neat_factor ?? 1.25)
  const [deficitActivityFallbackKcal, setDeficitActivityFallbackKcal] = useState(profile?.deficit_activity_fallback_kcal ?? 300)
  const [deficitGarminCorrection, setDeficitGarminCorrection] = useState(profile?.deficit_garmin_correction?.toString() ?? '0.75')
  const [deficitWeighInWeekday, setDeficitWeighInWeekday] = useState(profile?.deficit_weigh_in_weekday ?? 0)
  const [deficitRemindersEnabled, setDeficitRemindersEnabled] = useState(profile?.deficit_reminders_enabled ?? true)
  const [deficitAdvancedOpen, setDeficitAdvancedOpen] = useState(false)
  // The signature of the goal the last "jag förstår riskerna, använd ändå"
  // click applied to — null means not confirmed. Comparing this against
  // the CURRENT goal's signature (rather than storing a plain boolean) is
  // what makes the confirmation void itself the moment start/target/date
  // changes, with no separate reset logic needed.
  const [confirmedOverrideSignature, setConfirmedOverrideSignature] = useState<string | null>(
    profile?.deficit_override_acknowledged_at ? (profile?.deficit_override_signature ?? null) : null,
  )
  const [weeklyDigestEnabled, setWeeklyDigestEnabled] = useState(!profile?.weekly_digest_opt_out)
  const [coachTone, setCoachTone] = useState<CoachTone>((profile?.coach_tone as CoachTone) ?? 'neutral')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [stravaSyncing, setStravaSyncing] = useState(false)
  const [stravaSyncMsg, setStravaSyncMsg] = useState('')
  const [polarSyncing, setPolarSyncing] = useState(false)
  const [polarSyncMsg, setPolarSyncMsg] = useState('')
  const [garminSyncing, setGarminSyncing] = useState(false)
  const [garminMsg, setGarminMsg] = useState('')
  const [garminEmail, setGarminEmail] = useState('')
  const [garminPassword, setGarminPassword] = useState('')
  const [garminSaving, setGarminSaving] = useState(false)
  const [garminConnected, setGarminConnected] = useState(hasGarmin)
  const [yazioSyncing, setYazioSyncing] = useState(false)
  const [yazioMsg, setYazioMsg] = useState('')
  const [yazioEmail, setYazioEmail] = useState('')
  const [yazioPassword, setYazioPassword] = useState('')
  const [yazioSaving, setYazioSaving] = useState(false)
  const [yazioConnected, setYazioConnected] = useState(hasYazio)
  const [sendingTest, setSendingTest] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSaved, setPwSaved] = useState(false)
  const router = useRouter()

  function toggleKostMetric(m: KostMetric) {
    setKostTrackedMetrics(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }
  function toggleKostMeal(m: KostMeal) {
    setKostTrackedMeals(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createSupabaseClient()

    const parsedWeight = parseFloat(weightKg)
    const parsedLoadGoal = parseFloat(loadGoal)
    const parsedHeight = parseFloat(heightCm)
    const parsedBirthYear = parseInt(birthYear, 10)
    const parsedCalorieGoal = parseInt(calorieGoal, 10)
    const parsedProteinGoal = parseFloat(proteinGoalG)
    const parsedCarbGoal = parseFloat(carbGoalG)
    const parsedFatGoal = parseFloat(fatGoalG)

    const parsedDeficitStartWeight = parseFloat(deficitStartWeightKg)
    const parsedDeficitTargetWeight = parseFloat(deficitTargetWeightKg)
    const parsedDeficitCorrection = parseFloat(deficitGarminCorrection)

    // Only fields actually touched in this form get written back — Daniel:
    // "känns som inställningar och de specifika sidorna kan krocka med
    // varandra... Mitt dygnsmål gick från 2150 till 2049 helt plötsligt."
    // Root cause: every field's React state is a one-time snapshot from
    // when this page loaded, but the old code unconditionally rewrote ALL
    // of them on every save — so anything changed elsewhere since (Viktmål's
    // own budget refreeze, a milestone auto-revert) got silently reverted
    // the next time this form was submitted for a totally unrelated field,
    // e.g. from a background tab left open for a while. `profile` is a
    // stable prop for this component's whole lifetime, so re-evaluating the
    // exact expression each field's useState was seeded with still gives
    // the true mount-time value here — comparing against it tells us
    // whether the user actually touched a given control.
    const updates: Record<string, unknown> = {}
    function setIfChanged<T>(key: string, current: T, original: T) {
      if (JSON.stringify(current) !== JSON.stringify(original)) updates[key] = current
    }

    setIfChanged('name', name, profile?.name ?? '')
    setIfChanged('llm_provider', provider, profile?.llm_provider ?? 'gemini')
    setIfChanged('home_equipment', equipment, profile?.home_equipment ?? [])
    setIfChanged('selected_sports', sports, profile?.selected_sports ?? [])
    setIfChanged('daily_step_goal', stepGoal, profile?.daily_step_goal ?? 10000)
    setIfChanged('weight_kg', weightKg.trim() && !Number.isNaN(parsedWeight) ? parsedWeight : null, profile?.weight_kg ?? null)
    setIfChanged('weekly_load_goal', loadGoal.trim() && !Number.isNaN(parsedLoadGoal) ? parsedLoadGoal : null, profile?.weekly_load_goal ?? null)
    setIfChanged('height_cm', heightCm.trim() && !Number.isNaN(parsedHeight) ? parsedHeight : null, profile?.height_cm ?? null)
    setIfChanged('birth_year', birthYear.trim() && !Number.isNaN(parsedBirthYear) ? parsedBirthYear : null, profile?.birth_year ?? null)
    setIfChanged('biological_sex', biologicalSex || null, profile?.biological_sex ?? null)
    setIfChanged('daily_calorie_goal', calorieGoal.trim() && !Number.isNaN(parsedCalorieGoal) ? parsedCalorieGoal : null, profile?.daily_calorie_goal ?? null)
    setIfChanged('weekly_digest_opt_out', !weeklyDigestEnabled, !!profile?.weekly_digest_opt_out)
    setIfChanged('coach_tone', coachTone, (profile?.coach_tone as CoachTone) ?? 'neutral')
    setIfChanged('kost_tracking_enabled', kostTrackingEnabled, profile?.kost_tracking_enabled ?? false)
    setIfChanged('kost_tracked_metrics', kostTrackedMetrics.length ? kostTrackedMetrics : ['kcal'], (profile?.kost_tracked_metrics as KostMetric[] | null) ?? ['kcal'])
    setIfChanged('kost_tracked_meals', kostTrackedMeals, (profile?.kost_tracked_meals as KostMeal[] | null) ?? ['breakfast', 'lunch', 'dinner'])
    setIfChanged('kost_reminders_enabled', kostRemindersEnabled, profile?.kost_reminders_enabled ?? true)
    setIfChanged('kost_evening_guard_enabled', eveningGuardEnabled, profile?.kost_evening_guard_enabled ?? false)
    setIfChanged('kost_evening_guard_hour', eveningGuardHour, profile?.kost_evening_guard_hour ?? 20)
    setIfChanged('protein_goal_g', proteinGoalG.trim() && !Number.isNaN(parsedProteinGoal) ? parsedProteinGoal : null, profile?.protein_goal_g ?? null)
    setIfChanged('carb_goal_g', carbGoalG.trim() && !Number.isNaN(parsedCarbGoal) ? parsedCarbGoal : null, profile?.carb_goal_g ?? null)
    setIfChanged('fat_goal_g', fatGoalG.trim() && !Number.isNaN(parsedFatGoal) ? parsedFatGoal : null, profile?.fat_goal_g ?? null)
    setIfChanged('deficit_neat_factor', deficitNeatFactor, profile?.deficit_neat_factor ?? 1.25)
    setIfChanged('deficit_activity_fallback_kcal', deficitActivityFallbackKcal, profile?.deficit_activity_fallback_kcal ?? 300)
    setIfChanged('deficit_garmin_correction', deficitGarminCorrection.trim() && !Number.isNaN(parsedDeficitCorrection) ? parsedDeficitCorrection : 0.75, profile?.deficit_garmin_correction ?? 0.75)
    setIfChanged('deficit_weigh_in_weekday', deficitWeighInWeekday, profile?.deficit_weigh_in_weekday ?? 0)
    setIfChanged('deficit_reminders_enabled', deficitRemindersEnabled, profile?.deficit_reminders_enabled ?? true)

    // The goal (start/target weight, target date, tracking on/off) is
    // handled as one cohesive unit rather than diffed field-by-field —
    // they're genuinely interdependent (the override signature covers all
    // three together, the budget-clearing logic needs to know the goal as
    // a whole is incomplete). If NONE of the four changed, none of this
    // block runs at all — no stale goal fields get rewritten, and no
    // refreeze fires off the back of an unrelated save.
    const goalOriginalTrackingEnabled = profile?.deficit_tracking_enabled ?? false
    const goalOriginalStartWeightKg = profile?.deficit_start_weight_kg?.toString() ?? profile?.weight_kg?.toString() ?? ''
    const goalOriginalTargetWeightKg = profile?.deficit_target_weight_kg?.toString() ?? ''
    const goalOriginalTargetDate = profile?.deficit_target_date ?? ''
    const goalSectionTouched =
      deficitTrackingEnabled !== goalOriginalTrackingEnabled ||
      deficitStartWeightKg !== goalOriginalStartWeightKg ||
      deficitTargetWeightKg !== goalOriginalTargetWeightKg ||
      deficitTargetDate !== goalOriginalTargetDate

    // The frozen budget snapshot itself is no longer computed here — it's
    // recomputed server-side (lib/deficit-budget-refreeze.ts, called right
    // after this update lands) so it can account for an active delmål and
    // an acknowledged above-safe override, neither of which this form
    // knows about. Only the "goal turned off/incomplete → clear it" case
    // stays here, since the refreeze route requires a goal to already be
    // saved and won't touch these fields when there isn't one.
    const goalWillBeComplete = deficitTrackingEnabled && deficitStartWeightKg.trim() && deficitTargetWeightKg.trim() && deficitTargetDate

    if (goalSectionTouched) {
      // Start date freezes the first time the goal is ever saved with a
      // target — later edits to other settings never move it, so the
      // "starting point" of the goal stays meaningful.
      const deficitStartDateToSave = profile?.deficit_start_date
        ?? (deficitTrackingEnabled && deficitTargetWeightKg.trim() ? new Date().toISOString().slice(0, 10) : null)

      updates.deficit_tracking_enabled = deficitTrackingEnabled
      updates.deficit_start_weight_kg = deficitStartWeightKg.trim() && !Number.isNaN(parsedDeficitStartWeight) ? parsedDeficitStartWeight : null
      updates.deficit_start_date = deficitStartDateToSave
      updates.deficit_target_weight_kg = deficitTargetWeightKg.trim() && !Number.isNaN(parsedDeficitTargetWeight) ? parsedDeficitTargetWeight : null
      updates.deficit_target_date = deficitTargetDate || null

      if (!goalWillBeComplete) {
        Object.assign(updates, { deficit_tdee_kcal: null, deficit_budget_kcal: null, deficit_budget_computed_at: null, deficit_budget_source: 'overall', deficit_budget_valid_until: null, deficit_budget_daily_deficit_kcal: null })
      }

      // Written BEFORE the refreeze call below runs, since refreezeDeficitBudget
      // reads these back to decide allowUnsafe — an unconfirmed or stale
      // (goal-changed) signature always saves as voided, never carried over.
      const currentOverrideSignature = goalWillBeComplete
        ? deficitOverrideSignature({ startWeightKg: parsedDeficitStartWeight, targetWeightKg: parsedDeficitTargetWeight, targetDateISO: deficitTargetDate })
        : null
      const overrideConfirmedNow = goalWillBeComplete && confirmedOverrideSignature === currentOverrideSignature
      if (overrideConfirmedNow) {
        updates.deficit_override_acknowledged_at = new Date().toISOString()
        updates.deficit_override_signature = currentOverrideSignature
      } else {
        updates.deficit_override_acknowledged_at = null
        updates.deficit_override_signature = null
        updates.deficit_override_deficit_kcal = null
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('profiles').update(updates).eq('id', profile?.id ?? '')
    }

    if (goalSectionTouched && goalWillBeComplete) {
      await fetch('/api/deficit/budget/refreeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'settings_changed' }),
      })
    }

    if (apiKey.trim()) {
      await fetch('/api/profile/save-llm-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })
    }

    if (context !== savedContext) {
      await fetch('/api/context/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      })
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  async function syncNow() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/activities/sync', { method: 'POST' })
      const data = await res.json()
      if (data.synced !== undefined) {
        setSyncMsg(`Synkade ${data.synced} nya pass`)
        router.refresh()
      } else {
        setSyncMsg(data.error ?? 'Något gick fel')
      }
    } catch {
      setSyncMsg('Nätverksfel')
    }
    setSyncing(false)
  }

  async function syncStravaNow() {
    setStravaSyncing(true)
    setStravaSyncMsg('')
    try {
      const res = await fetch('/api/activities/sync-strava', { method: 'POST' })
      const data = await res.json()
      if (data.synced !== undefined) {
        setStravaSyncMsg(`Synkade ${data.synced} nya pass`)
        router.refresh()
      } else {
        setStravaSyncMsg(data.error ?? 'Något gick fel')
      }
    } catch {
      setStravaSyncMsg('Nätverksfel')
    }
    setStravaSyncing(false)
  }

  async function syncPolarNow() {
    setPolarSyncing(true)
    setPolarSyncMsg('')
    try {
      const res = await fetch('/api/activities/sync-polar', { method: 'POST' })
      const data = await res.json()
      if (data.synced !== undefined) {
        setPolarSyncMsg(`Synkade ${data.synced} nya pass`)
        router.refresh()
      } else {
        setPolarSyncMsg(data.error ?? 'Något gick fel')
      }
    } catch {
      setPolarSyncMsg('Nätverksfel')
    }
    setPolarSyncing(false)
  }

  async function saveGarmin(e: React.FormEvent) {
    e.preventDefault()
    setGarminSaving(true)
    setGarminMsg('')
    try {
      const res = await fetch('/api/garmin/save-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: garminEmail.trim(), password: garminPassword }),
      })
      const data = await res.json()
      if (data.ok) {
        setGarminConnected(true)
        setGarminPassword('')
        setGarminMsg('Ansluten!')
      } else {
        setGarminMsg(data.error ?? 'Något gick fel')
      }
    } catch {
      setGarminMsg('Nätverksfel')
    }
    setGarminSaving(false)
  }

  async function syncGarmin() {
    setGarminSyncing(true)
    setGarminMsg('')
    try {
      const res = await fetch('/api/activities/sync-garmin', { method: 'POST' })
      const data = await res.json()
      if (data.synced !== undefined) {
        const reclass = data.reclassified ? ` · ${data.reclassified} omklassade` : ''
        setGarminMsg(`Synkade ${data.synced} nya pass${reclass}`)
        router.refresh()
      } else {
        setGarminMsg(data.error ?? 'Något gick fel')
      }
    } catch {
      setGarminMsg('Nätverksfel')
    }
    setGarminSyncing(false)
  }

  async function saveYazio(e: React.FormEvent) {
    e.preventDefault()
    setYazioSaving(true)
    setYazioMsg('')
    try {
      const res = await fetch('/api/yazio/save-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: yazioEmail.trim(), password: yazioPassword }),
      })
      const data = await res.json()
      if (data.ok) {
        setYazioConnected(true)
        setYazioPassword('')
        setYazioMsg('Ansluten!')
      } else {
        setYazioMsg(data.error ?? 'Något gick fel')
      }
    } catch {
      setYazioMsg('Nätverksfel')
    }
    setYazioSaving(false)
  }

  // Första versionen: hämtar och sparar rådata för granskning, mappar
  // den ännu inte till matloggen — se lib/yazio-sync.ts.
  async function syncYazio() {
    setYazioSyncing(true)
    setYazioMsg('')
    try {
      const res = await fetch('/api/food/sync-yazio', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setYazioMsg(data.hasSummary ? 'Synkade — data hämtad, granskas innan den visas i matloggen' : 'Ansluten, men ingen data hittades för idag')
        router.refresh()
      } else {
        setYazioMsg(data.error ?? 'Något gick fel')
      }
    } catch {
      setYazioMsg('Nätverksfel')
    }
    setYazioSyncing(false)
  }

  async function sendTestDigest() {
    setSendingTest(true)
    setTestMsg('')
    try {
      const res = await fetch('/api/weekly-digest/send-test', { method: 'POST' })
      const data = await res.json()
      setTestMsg(data.ok ? 'Skickat! Kolla din inkorg.' : (data.error ?? 'Något gick fel'))
    } catch {
      setTestMsg('Nätverksfel')
    }
    setSendingTest(false)
  }

  async function signOut() {
    const supabase = createSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Works directly against the already-logged-in session (updateUser),
  // no email link involved at all — a real alternative to the mejl-baserade
  // återställningen, not just a UI wrapper around it. Same minLength as the
  // reset-password/new page for a consistent rule everywhere a password is
  // set.
  async function changePassword() {
    setPwError('')
    setPwSaved(false)
    if (newPassword.length < 6) {
      setPwError('Lösenordet måste vara minst 6 tecken')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('Lösenorden matchar inte')
      return
    }
    setPwSaving(true)
    const supabase = createSupabaseClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwSaving(false)
    if (error) {
      setPwError('Kunde inte byta lösenord. Försök igen eller logga ut och in på nytt.')
      return
    }
    setPwSaved(true)
    setNewPassword('')
    setConfirmPassword('')
  }

  const hasApiKey = !!profile?.llm_api_key_encrypted

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      {/* Account */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-2">Konto</div>
          <div className="text-fg text-sm">{userEmail}</div>
        </div>

        <button
          type="button"
          onClick={() => { setChangingPassword(v => !v); setPwError(''); setPwSaved(false) }}
          className="text-xs text-muted hover:text-fg transition-colors self-start flex items-center gap-1.5"
        >
          {changingPassword ? '▾' : '▸'} Byt lösenord
        </button>

        {changingPassword && (
          <div className="flex flex-col gap-3 pt-1 border-t border-edge">
            <div className="pt-2">
              <label className="text-muted text-xs block mb-1.5">Nytt lösenord</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="text-muted text-xs block mb-1.5">Bekräfta nytt lösenord</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            {pwError && <p className="text-red-400 text-xs">{pwError}</p>}
            {pwSaved && <p className="text-accent text-xs">✓ Lösenordet är uppdaterat.</p>}
            <button
              type="button"
              onClick={changePassword}
              disabled={pwSaving || !newPassword || !confirmPassword}
              className="text-xs bg-accent text-bg font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed hover:opacity-90 transition-opacity self-start"
            >
              {pwSaving ? 'Byter...' : 'Byt lösenord'}
            </button>
          </div>
        )}
      </div>

      {/* Profile */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-4">
        <div className="text-xs text-muted uppercase tracking-wider">Profil</div>
        <div>
          <label className="text-muted text-xs block mb-1.5">Namn</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="För- och efternamn"
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <div>
          <label className="text-muted text-xs block mb-1.5">Stegmål per dag</label>
          <input
            type="number"
            min={1000}
            step={500}
            value={stepGoal}
            onChange={e => setStepGoal(Math.max(0, parseInt(e.target.value, 10) || 0))}
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
          />
          <p className="text-muted text-xs mt-1.5">Styr steg-progressbaren och steg-streaken på Översikt.</p>
        </div>
        <div>
          <label className="text-muted text-xs block mb-1.5">Veckomål träningsbelastning (valfritt)</label>
          <input
            type="number"
            min={0}
            step={10}
            placeholder="Auto — ditt eget snitt senaste 8 veckorna"
            value={loadGoal}
            onChange={e => setLoadGoal(e.target.value)}
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
          />
          <p className="text-muted text-xs mt-1.5">Styr belastningsbaren på Översikt. Lämna tomt för att jämföra mot ditt eget snitt istället för ett fast mål.</p>
        </div>
        <div>
          <label className="text-muted text-xs block mb-1.5">Vikt (kg)</label>
          <input
            type="text"
            inputMode="decimal"
            value={weightKg}
            onChange={e => setWeightKg(normalizeDecimalInput(e.target.value))}
            placeholder="t.ex. 78 eller 78,5"
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
          />
          <p className="text-muted text-xs mt-1.5">Används för att räkna ut kalorier när du loggar ett pass manuellt.</p>
        </div>
      </div>

      {/* Body & calories */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-4">
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Kropp & kalorier</div>
          <p className="text-muted text-xs">Används för att uppskatta din basförbränning (vilopuls) i Mat-funktionen. Allt är valfritt — saknas något används ett schablonvärde, tydligt märkt som uppskattning.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-muted text-xs block mb-1.5">Längd (cm)</label>
            <input
              type="number"
              min={100}
              max={250}
              inputMode="numeric"
              value={heightCm}
              onChange={e => setHeightCm(e.target.value)}
              placeholder="t.ex. 180"
              className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="text-muted text-xs block mb-1.5">Födelseår</label>
            <input
              type="number"
              min={1920}
              max={new Date().getFullYear()}
              inputMode="numeric"
              value={birthYear}
              onChange={e => setBirthYear(e.target.value)}
              placeholder="t.ex. 1985"
              className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="text-muted text-xs block mb-1.5">Biologiskt kön</label>
          <select
            value={biologicalSex}
            onChange={e => setBiologicalSex(e.target.value as 'male' | 'female' | '')}
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-accent"
          >
            <option value="">Vill inte ange</option>
            <option value="male">Man</option>
            <option value="female">Kvinna</option>
          </select>
        </div>
        <div>
          <label className="text-muted text-xs block mb-1.5">Dagligt kalorimål (valfritt)</label>
          <input
            type="number"
            min={800}
            max={8000}
            step={50}
            inputMode="numeric"
            value={calorieGoal}
            onChange={e => setCalorieGoal(e.target.value)}
            placeholder="t.ex. 2400"
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
          />
          <p className="text-muted text-xs mt-1.5">
            {deficitTrackingEnabled
              ? 'Används bara om du stänger av Viktmål-spårning nedan — så länge den är på styr Viktmåls uträknade budget kalorirutan på Översikt och Kost istället.'
              : 'Styr kalorirutan på Översikt och Kost. Lämna tomt för att bara se ätit/bränt utan ett mål att jämföra mot.'}
          </p>
        </div>
      </div>

      {/* Kost-mål */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-4">
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Kost-mål</div>
          <p className="text-muted text-xs">Frivillig spårning på Kost-sidan — kalender, dagliga mål och påminnelser om du glömmer logga en måltid. Av som standard.</p>
        </div>
        <label className="flex items-center justify-between">
          <span className="text-sm text-fg">Spåra mål på Kost-sidan</span>
          <button
            type="button"
            role="switch"
            aria-checked={kostTrackingEnabled}
            onClick={() => setKostTrackingEnabled(v => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${kostTrackingEnabled ? 'bg-accent' : 'bg-edge'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-bg transition-transform ${kostTrackingEnabled ? 'translate-x-5' : ''}`} />
          </button>
        </label>

        {kostTrackingEnabled && (
          <>
            <div>
              <label className="text-muted text-xs block mb-2">Vad vill du hålla koll på?</label>
              <div className="flex flex-wrap gap-2">
                {KOST_METRICS.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleKostMetric(m)}
                    className={`text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${kostTrackedMetrics.includes(m) ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-fg hover:border-accent/30'}`}
                  >
                    {kostMetricLabel(m)}
                  </button>
                ))}
              </div>
            </div>

            {kostTrackedMetrics.includes('protein') && (
              <div>
                <label className="text-muted text-xs block mb-1.5">Proteinmål (g/dag)</label>
                <input type="number" min={0} step={5} inputMode="numeric" value={proteinGoalG} onChange={e => setProteinGoalG(e.target.value)} placeholder="t.ex. 150" className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors" />
              </div>
            )}
            {kostTrackedMetrics.includes('carb') && (
              <div>
                <label className="text-muted text-xs block mb-1.5">Kolhydratmål (g/dag)</label>
                <input type="number" min={0} step={5} inputMode="numeric" value={carbGoalG} onChange={e => setCarbGoalG(e.target.value)} placeholder="t.ex. 250" className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors" />
              </div>
            )}
            {kostTrackedMetrics.includes('fat') && (
              <div>
                <label className="text-muted text-xs block mb-1.5">Fettmål (g/dag)</label>
                <input type="number" min={0} step={5} inputMode="numeric" value={fatGoalG} onChange={e => setFatGoalG(e.target.value)} placeholder="t.ex. 70" className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors" />
              </div>
            )}
            {kostTrackedMetrics.includes('kcal') && !calorieGoal.trim() && !(deficitTrackingEnabled && profile?.deficit_budget_kcal != null) && (
              <p className="text-amber-400 text-xs -mt-2">Ange ett dagligt kalorimål ovan under &quot;Kropp &amp; kalorier&quot; (eller sätt upp ett viktmål) för att kalorier ska räknas med i kalendern.</p>
            )}

            <div>
              <label className="text-muted text-xs block mb-2">Vilka måltider vill du logga?</label>
              <div className="flex flex-wrap gap-2">
                {KOST_MEALS.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleKostMeal(m)}
                    className={`text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${kostTrackedMeals.includes(m) ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-fg hover:border-accent/30'}`}
                  >
                    {kostMealLabel(m)}
                  </button>
                ))}
              </div>
              <p className="text-muted text-xs mt-1.5">Kvällsmat och mellanmål går att logga flera gånger per dag — resten räknas som klara efter första loggningen.</p>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-fg">
              <input
                type="checkbox"
                checked={kostRemindersEnabled}
                onChange={e => setKostRemindersEnabled(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              Påminn mig om jag glömmer logga en måltid
            </label>

            <div>
              <label className="flex items-center gap-2.5 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={eveningGuardEnabled}
                  onChange={e => setEveningGuardEnabled(e.target.checked)}
                  className="w-4 h-4 accent-accent"
                />
                Fråga innan snabbval loggas sent på kvällen
              </label>
              <p className="text-muted text-xs mt-1.5 ml-6">Förhindrar att samma mellanmål råkar loggas två gånger vid snabb tapping på kvällen — frågar om du vill ersätta senaste posten eller lägga till en till.</p>
              {eveningGuardEnabled && (
                <div className="ml-6 mt-2 flex items-center gap-2">
                  <span className="text-muted text-xs">Från klockan</span>
                  <input
                    type="number" min={0} max={23} step={1} inputMode="numeric"
                    value={eveningGuardHour}
                    onChange={e => setEveningGuardHour(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                    className="w-16 bg-bg border border-edge rounded-lg px-2 py-1.5 text-sm text-fg text-center focus:outline-none focus:border-accent"
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Viktmål */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-4">
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Viktmål</div>
          <p className="text-muted text-xs">Sätt en målvikt och ett datum — appen räknar ut en fast daglig kaloribudget istället för att lägga till vad du tränat bort. Av som standard.</p>
        </div>
        <label className="flex items-center justify-between">
          <span className="text-sm text-fg">Följ ett viktmål</span>
          <button
            type="button"
            role="switch"
            aria-checked={deficitTrackingEnabled}
            onClick={() => setDeficitTrackingEnabled(v => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${deficitTrackingEnabled ? 'bg-accent' : 'bg-edge'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-bg transition-transform ${deficitTrackingEnabled ? 'translate-x-5' : ''}`} />
          </button>
        </label>

        {deficitTrackingEnabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-muted text-xs block mb-1.5">Startvikt (kg)</label>
                <input type="text" inputMode="decimal" value={deficitStartWeightKg} onChange={e => setDeficitStartWeightKg(normalizeDecimalInput(e.target.value))} placeholder="t.ex. 105 eller 105,2" className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors" />
              </div>
              <div>
                <label className="text-muted text-xs block mb-1.5">Målvikt (kg)</label>
                <input type="text" inputMode="decimal" value={deficitTargetWeightKg} onChange={e => setDeficitTargetWeightKg(normalizeDecimalInput(e.target.value))} placeholder="t.ex. 90" className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors" />
              </div>
            </div>
            <div>
              <label className="text-muted text-xs block mb-1.5">Måldatum</label>
              <input type="date" value={deficitTargetDate} onChange={e => setDeficitTargetDate(e.target.value)} className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-accent transition-colors" />
            </div>

            <div>
              <label className="text-muted text-xs block mb-2">Vardagsaktivitet (utöver träningen)</label>
              <div className="flex flex-wrap gap-2">
                {([{ label: 'Stillasittande', v: 1.15 }, { label: 'Normal', v: 1.25 }, { label: 'Rörlig', v: 1.4 }] as const).map(chip => (
                  <button key={chip.label} type="button" onClick={() => setDeficitNeatFactor(chip.v)} className={`text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${deficitNeatFactor === chip.v ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-fg hover:border-accent/30'}`}>
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-muted text-xs block mb-2">Antagen träningsförbränning (tills du loggat 14 dagar)</label>
              <div className="flex flex-wrap gap-2">
                {([{ label: 'Lätt (150 kcal)', v: 150 }, { label: 'Medel (300 kcal)', v: 300 }, { label: 'Hög (450 kcal)', v: 450 }] as const).map(chip => (
                  <button key={chip.label} type="button" onClick={() => setDeficitActivityFallbackKcal(chip.v)} className={`text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${deficitActivityFallbackKcal === chip.v ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-fg hover:border-accent/30'}`}>
                    {chip.label}
                  </button>
                ))}
              </div>
              {avgTrainingKcalRaw != null && (
                <p className="text-muted text-xs mt-1.5">Byts automatiskt mot ditt eget snitt (~{Math.round(avgTrainingKcalRaw)} kcal/dag senaste 28 dagarna) eftersom du redan har tillräckligt med loggad träning.</p>
              )}
            </div>

            <div>
              <label className="text-muted text-xs block mb-2">Vägningsdag</label>
              <div className="flex flex-wrap gap-2">
                {[{ label: 'Sön', v: 0 }, { label: 'Mån', v: 1 }, { label: 'Tis', v: 2 }, { label: 'Ons', v: 3 }, { label: 'Tors', v: 4 }, { label: 'Fre', v: 5 }, { label: 'Lör', v: 6 }].map(chip => (
                  <button key={chip.v} type="button" onClick={() => setDeficitWeighInWeekday(chip.v)} className={`text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${deficitWeighInWeekday === chip.v ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-fg hover:border-accent/30'}`}>
                    {chip.label}
                  </button>
                ))}
              </div>
              <p className="text-muted text-xs mt-1.5">Väg dig samma veckodag och tid (gärna morgon, före frukost) — det ger den mest tillförlitliga kurvan.</p>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-fg">
              <input type="checkbox" checked={deficitRemindersEnabled} onChange={e => setDeficitRemindersEnabled(e.target.checked)} className="w-4 h-4 accent-accent" />
              Påminn mig om vägning, midjemått och avstämning
            </label>

            {(() => {
              const bmr = estimateBMR({
                weightKg: weightKg.trim() ? parseFloat(weightKg) : null,
                heightCm: heightCm.trim() ? parseFloat(heightCm) : null,
                birthYear: birthYear.trim() ? parseInt(birthYear, 10) : null,
                biologicalSex: (biologicalSex || null) as 'male' | 'female' | null,
              }).bmr
              const startW = parseFloat(deficitStartWeightKg)
              const targetW = parseFloat(deficitTargetWeightKg)
              if (Number.isNaN(startW) || Number.isNaN(targetW) || !deficitTargetDate) {
                return <p className="text-muted text-xs">Fyll i startvikt, målvikt och måldatum för att se din budget.</p>
              }
              const currentSignature = deficitOverrideSignature({ startWeightKg: startW, targetWeightKg: targetW, targetDateISO: deficitTargetDate })
              const overrideConfirmed = confirmedOverrideSignature === currentSignature
              const correction = parseFloat(deficitGarminCorrection)
              const budget = computeDeficitBudget({
                bmr,
                goal: { startWeightKg: startW, targetWeightKg: targetW, targetDateISO: deficitTargetDate, neatFactor: deficitNeatFactor, garminCorrection: Number.isNaN(correction) ? 0.75 : correction },
                avgTrainingKcalRaw,
                activityFallbackKcal: deficitActivityFallbackKcal,
                now: new Date(),
                allowUnsafe: overrideConfirmed,
              })
              const { safety } = budget
              return (
                <div className="flex flex-col gap-2">
                  <div className="bg-bg rounded-xl p-3 flex flex-col gap-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-muted text-xs">Din dagliga budget blir</span>
                      <span className="font-mono text-accent text-lg font-bold">{budget.budgetKcal} kcal</span>
                    </div>
                    <div className="text-muted text-xs">TDEE ~{budget.tdeeKcal} kcal · underskott {budget.dailyDeficitKcal} kcal/dag</div>
                  </div>

                  {safety.breaches.length > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex flex-col gap-2">
                      <p className="text-amber-400 text-xs font-medium">Det här måldatumet är mer aggressivt än vi normalt rekommenderar:</p>
                      <ul className="text-amber-400/90 text-xs list-disc list-inside flex flex-col gap-0.5">
                        {safety.breaches.map(b => <li key={b}>{safetyBreachLabel(b)}</li>)}
                      </ul>
                      <p className="text-muted text-xs">
                        En säkrare budget vore <span className="font-mono">{safety.safeBudgetKcal} kcal</span> (underskott {safety.safeDailyDeficitKcal} kcal/dag)
                        {safety.suggestedTargetDateISO && `, vilket når målet ${new Date(`${safety.suggestedTargetDateISO}T00:00:00`).toLocaleDateString('sv-SE')} istället`}.
                      </p>
                      <label className="flex items-start gap-2.5 text-xs text-fg pt-1 border-t border-amber-500/20">
                        <input
                          type="checkbox"
                          checked={overrideConfirmed}
                          onChange={e => setConfirmedOverrideSignature(e.target.checked ? currentSignature : null)}
                          className="w-4 h-4 accent-amber-500 mt-0.5 flex-shrink-0"
                        />
                        <span>Jag förstår riskerna och vill använda {safety.breaches.includes('below_hard_floor') ? 'den snabbare' : 'det här'} takten ändå.</span>
                      </label>
                      {overrideConfirmed && safety.breaches.includes('below_hard_floor') && (
                        <p className="text-muted text-xs">Budgeten klamras ändå till en absolut säkerhetsgräns på minst {safety.hardFloorKcal} kcal — den kan inte gå lägre än så oavsett bekräftelse.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            <button type="button" onClick={() => setDeficitAdvancedOpen(v => !v)} className="text-xs text-muted hover:text-fg transition-colors self-start flex items-center gap-1.5">
              {deficitAdvancedOpen ? '▾' : '▸'} Avancerat
            </button>
            {deficitAdvancedOpen && (
              <div>
                <label className="text-muted text-xs block mb-1.5">Korrigeringsfaktor på Garmins träningskalorier</label>
                <input type="text" inputMode="decimal" value={deficitGarminCorrection} onChange={e => setDeficitGarminCorrection(normalizeDecimalInput(e.target.value))} className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg font-mono focus:outline-none focus:border-accent transition-colors" />
                <p className="text-muted text-xs mt-1.5">Garmin överskattar ofta träningsförbränning, särskilt för rodd. 0,75 är en rimlig startpunkt — sköts normalt av avstämningen var 3–4:e vecka istället för att ändras för hand. Påverkar bara den här budgeten, aldrig kalorirutan på Översikt eller andra sidor.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Veckans Recap */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Veckans Recap</div>
          <p className="text-muted text-xs">En helhetsbild av veckans pass, steg, sömn och följsamhet mot planen — skickas på mail varje söndag. Separat från nyhetsbrevet, så du kan ha av/på oberoende av varandra.</p>
        </div>
        <label className="flex items-center gap-2.5 text-sm text-fg">
          <input
            type="checkbox"
            checked={weeklyDigestEnabled}
            onChange={e => setWeeklyDigestEnabled(e.target.checked)}
            className="w-4 h-4 accent-accent"
          />
          Skicka Veckans Recap på mail varje söndag
        </label>
        <div>
          <button
            type="button"
            onClick={sendTestDigest}
            disabled={sendingTest}
            className="text-xs bg-bg border border-edge px-3 py-2 rounded-lg text-fg disabled:opacity-50 hover:border-accent transition-colors"
          >
            {sendingTest ? 'Skickar...' : 'Skicka testmail till mig'}
          </button>
          {testMsg && <p className="text-muted text-xs mt-1.5">{testMsg}</p>}
        </div>
      </div>

      {/* Training context */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Om dig</div>
          <p className="text-muted text-xs">Tas med i varje coachsamtal — jobb, livssituation, personlighet, skador, mål. Allt som hjälper AI:n förstå helheten, inte bara siffrorna.</p>
        </div>
        <textarea
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder={CONTEXT_PLACEHOLDER}
          rows={7}
          className="w-full bg-bg border border-edge rounded-xl px-4 py-3 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors resize-none leading-relaxed"
        />
      </div>

      {/* Equipment & sports */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-4">
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Utrustning & aktiviteter</div>
          <p className="text-muted text-xs">Vad du har hemma och vilka sporter du utövar — så coachens tips utgår från det som faktiskt finns tillgängligt istället för att gissa.</p>
        </div>
        <ChipPicker
          label="Utrustning hemma"
          options={COMMON_EQUIPMENT}
          selected={equipment}
          onToggle={v => setEquipment(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])}
          onAddCustom={v => setEquipment(prev => prev.includes(v) ? prev : [...prev, v])}
        />
        <ChipPicker
          label="Aktiviteter/sporter"
          options={COMMON_SPORTS}
          selected={sports}
          onToggle={v => setSports(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])}
          onAddCustom={v => setSports(prev => prev.includes(v) ? prev : [...prev, v])}
        />
      </div>

      {/* Concept2 */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        <div className="text-xs text-muted uppercase tracking-wider">Concept2 Logbook</div>
        {hasConcept2 ? (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm text-fg flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full inline-block ${concept2Synced ? 'bg-accent' : 'bg-amber-400'}`} />
                {concept2Synced ? 'Ansluten' : 'Ansluten — väntar på första synk'}
              </div>
              {syncMsg && <div className="text-xs text-lcd mt-1">{syncMsg}</div>}
            </div>
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing}
              className="text-xs bg-bg border border-edge px-3 py-2 rounded-lg text-fg disabled:opacity-50 hover:border-accent transition-colors"
            >
              {syncing ? 'Synkar...' : 'Synka nu'}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-muted text-xs mb-2">
              Anslut Concept2 Logbook för att automatiskt synka dina roddpass.
            </p>
            <div className="bg-bg rounded-xl p-3 mb-3 text-xs text-muted leading-relaxed">
              <span className="text-fg font-medium">Så funkar det:</span> klicka på knappen nedan så skickas du till Concept2 Logbooks egen inloggningssida (log.concept2.com). Logga in med samma konto du använder i Concept2-appen eller på ergometern. Du loggar in direkt hos Concept2 — vi ser eller sparar aldrig ditt lösenord, bara en åtkomsttoken efteråt.
            </div>
            <a
              href="/api/auth/concept2"
              className="inline-block bg-accent text-bg text-xs font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
            >
              Anslut Concept2
            </a>
          </div>
        )}
      </div>

      {/* Strava */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        <div className="text-xs text-muted uppercase tracking-wider">Strava</div>
        {hasStrava ? (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm text-fg flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full inline-block ${stravaSynced ? 'bg-accent' : 'bg-amber-400'}`} />
                {stravaSynced ? 'Ansluten' : 'Ansluten — väntar på första synk'}
              </div>
              {stravaSyncMsg && <div className="text-xs text-lcd mt-1">{stravaSyncMsg}</div>}
            </div>
            <button
              type="button"
              onClick={syncStravaNow}
              disabled={stravaSyncing}
              className="text-xs bg-bg border border-edge px-3 py-2 rounded-lg text-fg disabled:opacity-50 hover:border-accent transition-colors"
            >
              {stravaSyncing ? 'Synkar...' : 'Synka nu'}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-muted text-xs mb-2">
              Anslut Strava för att automatiskt synka dina pass därifrån.
            </p>
            <div className="bg-bg rounded-xl p-3 mb-3 text-xs text-muted leading-relaxed">
              <span className="text-fg font-medium">Så funkar det:</span> klicka på knappen nedan så skickas du till Stravas egen inloggningssida. Logga in med ditt vanliga Strava-konto och godkänn åtkomsten. Du loggar in direkt hos Strava — vi ser eller sparar aldrig ditt lösenord, bara en åtkomsttoken efteråt.
            </div>
            <a
              href="/api/auth/strava"
              className="inline-block bg-accent text-bg text-xs font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
            >
              Anslut Strava
            </a>
          </div>
        )}
      </div>

      {/* Polar */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        <div className="text-xs text-muted uppercase tracking-wider">Polar</div>
        {hasPolar ? (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm text-fg flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full inline-block ${polarSynced ? 'bg-accent' : 'bg-amber-400'}`} />
                {polarSynced ? 'Ansluten' : 'Ansluten — väntar på första synk'}
              </div>
              {polarSyncMsg && <div className="text-xs text-lcd mt-1">{polarSyncMsg}</div>}
            </div>
            <button
              type="button"
              onClick={syncPolarNow}
              disabled={polarSyncing}
              className="text-xs bg-bg border border-edge px-3 py-2 rounded-lg text-fg disabled:opacity-50 hover:border-accent transition-colors"
            >
              {polarSyncing ? 'Synkar...' : 'Synka nu'}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-muted text-xs mb-2">
              Anslut Polar Flow för att automatiskt synka dina pass därifrån.
            </p>
            <div className="bg-bg rounded-xl p-3 mb-3 text-xs text-muted leading-relaxed">
              <span className="text-fg font-medium">Så funkar det:</span> klicka på knappen nedan så skickas du till Polars egen inloggningssida. Logga in med ditt vanliga Polar Flow-konto och godkänn åtkomsten. Du loggar in direkt hos Polar — vi ser eller sparar aldrig ditt lösenord, bara en åtkomsttoken efteråt.
            </div>
            <a
              href="/api/auth/polar"
              className="inline-block bg-accent text-bg text-xs font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
            >
              Anslut Polar
            </a>
          </div>
        )}
      </div>

      {/* Garmin */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        <div className="text-xs text-muted uppercase tracking-wider">Garmin Connect</div>
        {garminConnected ? (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm text-fg flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full inline-block ${garminSynced ? 'bg-accent' : 'bg-amber-400'}`} />
                {garminSynced ? 'Ansluten' : 'Ansluten — väntar på första synk'}
              </div>
              {garminMsg && <div className="text-xs text-lcd mt-1">{garminMsg}</div>}
            </div>
            <button
              type="button"
              onClick={syncGarmin}
              disabled={garminSyncing}
              className="text-xs bg-bg border border-edge px-3 py-2 rounded-lg text-fg disabled:opacity-50 hover:border-accent transition-colors"
            >
              {garminSyncing ? 'Synkar...' : 'Synka nu'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-muted text-xs">
              Ange dina Garmin Connect-uppgifter för att synka aktiviteter och hälsodata.
            </p>
            <div className="bg-bg rounded-xl p-3 text-xs text-muted leading-relaxed">
              <span className="text-fg font-medium">Vilka uppgifter behövs?</span> samma e-post och lösenord som du använder för att logga in på connect.garmin.com eller i Garmin Connect-appen på telefonen. Inget separat konto behövs. Lösenordet krypteras innan det sparas och används bara för att hämta dina egna aktiviteter, sömn, puls och steg.
            </div>
            <div>
              <label className="text-muted text-xs block mb-1.5">E-post</label>
              <input
                type="email"
                value={garminEmail}
                onChange={e => setGarminEmail(e.target.value)}
                placeholder="din@email.com"
                className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="text-muted text-xs block mb-1.5">Lösenord</label>
              <input
                type="password"
                value={garminPassword}
                onChange={e => setGarminPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            {garminMsg && <div className="text-xs text-lcd">{garminMsg}</div>}
            <button
              type="button"
              onClick={saveGarmin}
              disabled={garminSaving || !garminEmail.trim() || !garminPassword}
              className="text-xs bg-accent text-bg font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {garminSaving ? 'Ansluter...' : 'Anslut Garmin'}
            </button>
          </div>
        )}
      </div>

      {/* YAZIO */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        <div className="text-xs text-muted uppercase tracking-wider">YAZIO</div>
        {yazioConnected ? (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm text-fg flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full inline-block ${yazioSynced ? 'bg-accent' : 'bg-amber-400'}`} />
                {yazioSynced ? 'Ansluten' : 'Ansluten — väntar på första synk'}
              </div>
              {yazioMsg && <div className="text-xs text-lcd mt-1">{yazioMsg}</div>}
            </div>
            <button
              type="button"
              onClick={syncYazio}
              disabled={yazioSyncing}
              className="text-xs bg-bg border border-edge px-3 py-2 rounded-lg text-fg disabled:opacity-50 hover:border-accent transition-colors"
            >
              {yazioSyncing ? 'Synkar...' : 'Synka nu'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-muted text-xs">
              Ange dina YAZIO-uppgifter för att synka din matdagbok.
            </p>
            <div className="bg-bg rounded-xl p-3 text-xs text-muted leading-relaxed">
              <span className="text-fg font-medium">Vilka uppgifter behövs?</span> samma e-post och lösenord som du använder i YAZIO-appen. Lösenordet krypteras innan det sparas. <span className="text-fg font-medium">Tidig version:</span> kopplingen hämtar din data så vi kan se hur den ser ut, men visar den inte i matloggen ännu.
            </div>
            <div>
              <label className="text-muted text-xs block mb-1.5">E-post</label>
              <input
                type="email"
                value={yazioEmail}
                onChange={e => setYazioEmail(e.target.value)}
                placeholder="din@email.com"
                className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="text-muted text-xs block mb-1.5">Lösenord</label>
              <input
                type="password"
                value={yazioPassword}
                onChange={e => setYazioPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            {yazioMsg && <div className="text-xs text-lcd">{yazioMsg}</div>}
            <button
              type="button"
              onClick={saveYazio}
              disabled={yazioSaving || !yazioEmail.trim() || !yazioPassword}
              className="text-xs bg-accent text-bg font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {yazioSaving ? 'Ansluter...' : 'Anslut YAZIO'}
            </button>
          </div>
        )}
      </div>

      {/* AI settings */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-4">
        <div className="text-xs text-muted uppercase tracking-wider">AI-inställningar</div>
        <p className="text-muted text-xs -mt-2">
          Gemini används som standard (gratis). Lägg till din egen nyckel för att prioritera den.
        </p>
        <div>
          <label className="text-muted text-xs block mb-1.5">Leverantör (valfritt)</label>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-accent"
          >
            <option value="gemini">Google Gemini (standard)</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
          </select>
        </div>
        <div>
          <label className="text-muted text-xs block mb-1.5">
            Egen API-nyckel {hasApiKey ? '(sparat — lämna tomt för att behålla)' : '(valfritt)'}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={
              hasApiKey
                ? '••••••••••••'
                : provider === 'anthropic'
                ? 'sk-ant-...'
                : provider === 'openai'
                ? 'sk-...'
                : 'AIzaSy... (från aistudio.google.com)'
            }
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
          />
          {!hasApiKey && provider === 'gemini' && (
            <p className="text-muted text-xs mt-1.5">
              Hämta på aistudio.google.com → Get API key (nyckeln börjar med AIzaSy...)
            </p>
          )}
          {!hasApiKey && provider === 'anthropic' && (
            <p className="text-muted text-xs mt-1.5">
              Hämtas på console.anthropic.com → API Keys
            </p>
          )}
        </div>
        <div>
          <label className="text-muted text-xs block mb-1.5">Coachens ton</label>
          <p className="text-muted text-[11px] mb-2">Påverkar Coach-chatten, Insikter, Veckans Recap och Veckoplanens text — konsekvent oavsett var du möter coachen.</p>
          <div className="grid grid-cols-3 gap-2">
            {(['snall', 'neutral', 'tuff'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setCoachTone(t)}
                className={`text-xs font-medium px-3 py-2.5 rounded-xl border transition-colors ${
                  coachTone === t ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-fg hover:border-accent/30'
                }`}
              >
                {COACH_TONE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat security */}
      {((profile?.flagged_attempts ?? 0) > 0 || profile?.locked) && (
        <div className={`bg-card border rounded-2xl p-4 flex flex-col gap-3 ${profile?.locked ? 'border-red-500/40' : 'border-amber-500/30'}`}>
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-muted">Chattsäkerhet</div>
            {profile?.locked ? (
              <span className="text-xs text-red-400 font-medium">🔒 Kontot låst</span>
            ) : (
              <span className="text-xs text-amber-400 font-medium">{profile?.flagged_attempts} flaggade</span>
            )}
          </div>
          {profile?.locked && (
            <p className="text-muted text-xs leading-relaxed">
              Chatten är låst efter upprepade misstänkta meddelanden (kod, prompt-injektion eller orelaterade frågor). Lås upp manuellt i Supabase under tabellen <span className="text-fg font-mono">profiles</span> genom att sätta <span className="text-fg font-mono">locked = false</span>.
            </p>
          )}
          {!!profile?.flag_log?.length && (
            <div className="flex flex-col gap-1.5">
              {profile.flag_log.slice(0, 5).map((f, i) => (
                <div key={i} className="bg-bg rounded-lg px-3 py-2 text-xs">
                  <div className="flex justify-between text-muted">
                    <span className="text-fg">{f.reason}</span>
                    <span>{new Date(f.at).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="text-muted mt-0.5 truncate">&quot;{f.snippet}&quot;</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-accent text-bg font-semibold py-3 rounded-xl disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed transition-opacity text-sm"
      >
        {saved ? '✓ Sparat' : saving ? 'Sparar...' : 'Spara ändringar'}
      </button>

      <button
        type="button"
        onClick={signOut}
        className="text-muted text-sm py-2 hover:text-fg transition-colors"
      >
        Logga ut
      </button>
    </form>
  )
}
