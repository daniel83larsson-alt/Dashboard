'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'
import { estimateBMR } from '@/lib/bmr'
import { computeDeficitBudget, deficitOverrideSignature, safetyBreachLabel } from '@/lib/deficit'
import { TRAINING_LOOKBACK_DAYS, MIN_TRAINING_HISTORY_DAYS } from '@/lib/deficit-budget-refreeze'

// Same fix as ProfileForm.tsx's copy — native number inputs are unreliable
// across browsers/keyboards for a Swedish decimal comma ("105,2").
function normalizeDecimalInput(raw: string): string {
  return raw.replace(',', '.')
}

// All the fields that make up a Viktmål-goal, moved here from
// ProfileForm.tsx/Inställningar (Daniel: "man vill ha en funktion, slå på
// där, sen egentligen allt annat ställs in från sidan"). Only the on/off
// toggle remains in Profil — everything about WHAT the goal actually is
// lives here, next to the dashboard that uses it. Pure UI relocation: same
// database columns, same save semantics (start-date-freezes-on-first-save,
// override-signature safety confirmation, budget-clearing when the goal is
// incomplete, weight_kg backfill for a brand new goal) as the old
// ProfileForm block — nothing about how the numbers are computed changed.
export default function ViktmalSettingsCard({
  userId,
  currentProfileWeightKg,
  startWeightKg,
  startDate,
  targetWeightKg,
  targetDate,
  neatFactor,
  activityFallbackKcal,
  garminCorrection,
  weighInWeekday,
  remindersEnabled,
  overrideAcknowledgedAt,
  overrideSignature,
  avgTrainingKcalRaw,
  bmrWeightKg,
  bmrHeightCm,
  bmrBirthYear,
  bmrBiologicalSex,
  isAdmin,
}: {
  userId: string
  currentProfileWeightKg: number | null
  startWeightKg: number | null
  startDate: string | null
  targetWeightKg: number | null
  targetDate: string | null
  neatFactor: number
  activityFallbackKcal: number
  garminCorrection: number
  weighInWeekday: number
  remindersEnabled: boolean
  overrideAcknowledgedAt: string | null
  overrideSignature: string | null
  avgTrainingKcalRaw: number | null
  bmrWeightKg: number | null
  bmrHeightCm: number | null
  bmrBirthYear: number | null
  bmrBiologicalSex: 'male' | 'female' | null
  isAdmin: boolean
}) {
  const router = useRouter()
  const [deficitStartWeightKg, setDeficitStartWeightKg] = useState(startWeightKg?.toString() ?? currentProfileWeightKg?.toString() ?? '')
  const [deficitTargetWeightKg, setDeficitTargetWeightKg] = useState(targetWeightKg?.toString() ?? '')
  const [deficitTargetDate, setDeficitTargetDate] = useState(targetDate ?? '')
  const [deficitNeatFactor, setDeficitNeatFactor] = useState(neatFactor)
  const [deficitActivityFallbackKcal, setDeficitActivityFallbackKcal] = useState(activityFallbackKcal)
  const [deficitGarminCorrection, setDeficitGarminCorrection] = useState(garminCorrection.toString())
  const [deficitWeighInWeekday, setDeficitWeighInWeekday] = useState(weighInWeekday)
  const [deficitRemindersEnabled, setDeficitRemindersEnabled] = useState(remindersEnabled)
  const [deficitAdvancedOpen, setDeficitAdvancedOpen] = useState(false)
  // Signature of the goal the last "jag förstår riskerna" click applied to —
  // comparing against the CURRENT goal's signature (instead of a plain
  // boolean) is what voids the confirmation the moment start/target/date
  // changes, with no separate reset logic needed.
  const [confirmedOverrideSignature, setConfirmedOverrideSignature] = useState<string | null>(
    overrideAcknowledgedAt ? (overrideSignature ?? null) : null,
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [testRefreezing, setTestRefreezing] = useState(false)
  const [testRefreezeMsg, setTestRefreezeMsg] = useState('')

  async function save() {
    setSaving(true)
    setSaveError('')
    const supabase = createSupabaseClient()

    const parsedStartWeight = parseFloat(deficitStartWeightKg)
    const parsedTargetWeight = parseFloat(deficitTargetWeightKg)
    const parsedCorrection = parseFloat(deficitGarminCorrection)
    const goalWillBeComplete = !!(deficitStartWeightKg.trim() && deficitTargetWeightKg.trim() && deficitTargetDate)

    const updates: Record<string, unknown> = {}
    // Start date freezes the first time the goal is ever saved with a
    // target — later edits to other settings never move it, so the
    // "starting point" of the goal stays meaningful.
    updates.deficit_start_date = startDate ?? (deficitTargetWeightKg.trim() ? new Date().toISOString().slice(0, 10) : null)
    updates.deficit_start_weight_kg = deficitStartWeightKg.trim() && !Number.isNaN(parsedStartWeight) ? parsedStartWeight : null
    updates.deficit_target_weight_kg = deficitTargetWeightKg.trim() && !Number.isNaN(parsedTargetWeight) ? parsedTargetWeight : null
    updates.deficit_target_date = deficitTargetDate || null
    updates.deficit_neat_factor = deficitNeatFactor
    updates.deficit_activity_fallback_kcal = deficitActivityFallbackKcal
    updates.deficit_garmin_correction = deficitGarminCorrection.trim() && !Number.isNaN(parsedCorrection) ? parsedCorrection : 0.75
    updates.deficit_weigh_in_weekday = deficitWeighInWeekday
    updates.deficit_reminders_enabled = deficitRemindersEnabled

    if (!goalWillBeComplete) {
      Object.assign(updates, { deficit_tdee_kcal: null, deficit_budget_kcal: null, deficit_budget_computed_at: null, deficit_budget_source: 'overall', deficit_budget_valid_until: null, deficit_budget_daily_deficit_kcal: null })
    }

    // Written the same way the old ProfileForm save did: an unconfirmed or
    // stale (goal-changed) signature always saves as voided, never carried
    // over silently.
    const currentOverrideSignature = goalWillBeComplete
      ? deficitOverrideSignature({ startWeightKg: parsedStartWeight, targetWeightKg: parsedTargetWeight, targetDateISO: deficitTargetDate })
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

    // Real incident (Conny): a brand new goal's start weight genuinely IS
    // your current weight at that moment, so it backfills profiles.weight_kg
    // — but only when it's genuinely still unset, so an existing weight kept
    // current by real Viktmål weigh-ins is never silently overwritten.
    if (currentProfileWeightKg == null && deficitStartWeightKg.trim() && !Number.isNaN(parsedStartWeight)) {
      updates.weight_kg = parsedStartWeight
    }

    const { error } = await supabase.from('profiles').update(updates).eq('id', userId)
    setSaving(false)
    if (error) { setSaveError('Kunde inte spara'); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    // No immediate refreeze — Daniel's trigger-schedule addendum: an
    // ordinary settings save waits for söndagens schemalagda omräkning
    // instead of rewriting the budget on the spot.
    router.refresh()
  }

  // Admin-only — lets Daniel, as tester, force a recompute without waiting
  // for Sunday, logged under its own 'manual_test' reason.
  async function triggerTestRefreeze() {
    setTestRefreezing(true)
    setTestRefreezeMsg('')
    try {
      const res = await fetch('/api/deficit/budget/refreeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual_test' }),
      })
      const data = await res.json()
      if (res.ok) {
        setTestRefreezeMsg(data.changed ? `Ny budget: ${data.after.budgetKcal} kcal (TDEE ${data.after.tdeeKcal})` : 'Ingen förändring')
        router.refresh()
      } else {
        setTestRefreezeMsg(data.error ?? 'Något gick fel')
      }
    } catch {
      setTestRefreezeMsg('Nätverksfel')
    }
    setTestRefreezing(false)
  }

  return (
    <div className="flex flex-col gap-4">
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
      <p className="text-amber-400/90 text-xs -mt-1">Ändrar du start-/målvikt eller måldatum uppdateras din dagliga budget vid söndagens schemalagda omräkning, inte direkt när du sparar.</p>

      {isAdmin && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={triggerTestRefreeze} disabled={testRefreezing} className="text-xs font-medium px-3 py-2 rounded-xl border border-edge text-fg hover:border-accent/30 disabled:opacity-50">
            {testRefreezing ? 'Räknar om...' : 'Räkna om nu (test)'}
          </button>
          {testRefreezeMsg && <span className="text-muted text-xs">{testRefreezeMsg}</span>}
        </div>
      )}

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
        <label className="text-muted text-xs block mb-2">Antagen träningsförbränning (tills du loggat {MIN_TRAINING_HISTORY_DAYS} dagar)</label>
        <div className="flex flex-wrap gap-2">
          {([{ label: 'Lätt (150 kcal)', v: 150 }, { label: 'Medel (300 kcal)', v: 300 }, { label: 'Hög (450 kcal)', v: 450 }] as const).map(chip => (
            <button key={chip.label} type="button" onClick={() => setDeficitActivityFallbackKcal(chip.v)} className={`text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${deficitActivityFallbackKcal === chip.v ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-fg hover:border-accent/30'}`}>
              {chip.label}
            </button>
          ))}
        </div>
        {avgTrainingKcalRaw != null && (
          <p className="text-muted text-xs mt-1.5">Byts automatiskt mot ditt eget snitt (~{Math.round(avgTrainingKcalRaw)} kcal/dag senaste {TRAINING_LOOKBACK_DAYS} dagarna) eftersom du redan har tillräckligt med loggad träning.</p>
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
          weightKg: bmrWeightKg,
          heightCm: bmrHeightCm,
          birthYear: bmrBirthYear,
          biologicalSex: bmrBiologicalSex,
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

      {saveError && <p className="text-red-400 text-xs">{saveError}</p>}
      <button type="button" onClick={save} disabled={saving} className="bg-accent text-bg font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 self-start px-6">
        {saving ? 'Sparar...' : saved ? '✓ Sparat' : 'Spara inställningar'}
      </button>
    </div>
  )
}
