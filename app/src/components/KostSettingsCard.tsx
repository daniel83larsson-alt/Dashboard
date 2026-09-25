'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'
import { KOST_METRICS, KOST_MEALS, kostMetricLabel, kostMealLabel, type KostMetric, type KostMeal } from '@/lib/kost'

// Everything about WHAT is tracked on Kost, moved here from
// ProfileForm.tsx/Inställningar (same pilot pattern as ViktmalSettingsCard
// on Viktmål: Daniel: "man vill ha en funktion, slå på där, sen egentligen
// allt annat ställs in från sidan"). Only the on/off toggle remains in
// Profil — everything about vilka mått/måltider som spåras, proteinmål och
// kvällsvakten hör hemma här. Pure UI relocation: same columns, same save
// semantics as the old ProfileForm block.
export default function KostSettingsCard({
  userId,
  trackedMetrics: initialTrackedMetrics,
  trackedMeals: initialTrackedMeals,
  remindersEnabled: initialRemindersEnabled,
  eveningGuardEnabled: initialEveningGuardEnabled,
  eveningGuardHour: initialEveningGuardHour,
  proteinGoalG: initialProteinGoalG,
  proteinGoalMode: initialProteinGoalMode,
  carbGoalG: initialCarbGoalG,
  fatGoalG: initialFatGoalG,
  hasCalorieGoal,
}: {
  userId: string
  trackedMetrics: KostMetric[]
  trackedMeals: KostMeal[]
  remindersEnabled: boolean
  eveningGuardEnabled: boolean
  eveningGuardHour: number
  proteinGoalG: number | null
  proteinGoalMode: 'auto' | 'manual'
  carbGoalG: number | null
  fatGoalG: number | null
  hasCalorieGoal: boolean
}) {
  const router = useRouter()
  const [trackedMetrics, setTrackedMetrics] = useState<KostMetric[]>(initialTrackedMetrics)
  const [trackedMeals, setTrackedMeals] = useState<KostMeal[]>(initialTrackedMeals)
  const [remindersEnabled, setRemindersEnabled] = useState(initialRemindersEnabled)
  const [eveningGuardEnabled, setEveningGuardEnabled] = useState(initialEveningGuardEnabled)
  const [eveningGuardHour, setEveningGuardHour] = useState(initialEveningGuardHour)
  const [proteinGoalG, setProteinGoalG] = useState(initialProteinGoalG?.toString() ?? '')
  const [proteinGoalMode, setProteinGoalMode] = useState<'auto' | 'manual'>(initialProteinGoalMode)
  const [proteinRefreezing, setProteinRefreezing] = useState(false)
  const [proteinRefreezeMsg, setProteinRefreezeMsg] = useState('')
  const [carbGoalG, setCarbGoalG] = useState(initialCarbGoalG?.toString() ?? '')
  const [fatGoalG, setFatGoalG] = useState(initialFatGoalG?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  function toggleMetric(m: KostMetric) {
    setTrackedMetrics(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }
  function toggleMeal(m: KostMeal) {
    setTrackedMeals(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  // Checking the box back ON is a deliberate, rare action — recomputes right
  // away instead of waiting for söndag. Unchecking it is just a local mode
  // switch (Daniel: "vill man inte ha det utan ett eget så får man kryssa ut
  // det") — the manual value only persists on Spara, same as any other field.
  async function handleProteinModeToggle(nextAuto: boolean) {
    if (!nextAuto) {
      setProteinGoalMode('manual')
      setProteinRefreezeMsg('')
      return
    }
    setProteinGoalMode('auto')
    setProteinRefreezing(true)
    setProteinRefreezeMsg('')
    try {
      const res = await fetch('/api/protein/refreeze', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.result?.newGoalG != null) {
        setProteinGoalG(String(data.result.newGoalG))
        setProteinRefreezeMsg(`Uppdaterat: ${data.result.newGoalG} g/dag`)
      } else {
        setProteinRefreezeMsg('Kunde inte räkna om ännu — logga en vägning på Viktmål först.')
      }
    } catch {
      setProteinRefreezeMsg('Nätverksfel')
    }
    setProteinRefreezing(false)
  }

  async function save() {
    setSaving(true)
    setSaveError('')
    const supabase = createSupabaseClient()

    const parsedProteinGoal = parseFloat(proteinGoalG)
    const parsedCarbGoal = parseFloat(carbGoalG)
    const parsedFatGoal = parseFloat(fatGoalG)

    const updates: Record<string, unknown> = {
      kost_tracked_metrics: trackedMetrics.length ? trackedMetrics : ['kcal'],
      kost_tracked_meals: trackedMeals,
      kost_reminders_enabled: remindersEnabled,
      kost_evening_guard_enabled: eveningGuardEnabled,
      kost_evening_guard_hour: eveningGuardHour,
      protein_goal_g: proteinGoalG.trim() && !Number.isNaN(parsedProteinGoal) ? parsedProteinGoal : null,
      protein_goal_mode: proteinGoalMode,
      carb_goal_g: carbGoalG.trim() && !Number.isNaN(parsedCarbGoal) ? parsedCarbGoal : null,
      fat_goal_g: fatGoalG.trim() && !Number.isNaN(parsedFatGoal) ? parsedFatGoal : null,
    }

    const { error } = await supabase.from('profiles').update(updates).eq('id', userId)
    setSaving(false)
    if (error) { setSaveError('Kunde inte spara'); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-muted text-xs block mb-2">Vad vill du hålla koll på?</label>
        <div className="flex flex-wrap gap-2">
          {KOST_METRICS.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMetric(m)}
              className={`text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${trackedMetrics.includes(m) ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-fg hover:border-accent/30'}`}
            >
              {kostMetricLabel(m)}
            </button>
          ))}
        </div>
      </div>

      {trackedMetrics.includes('protein') && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-muted text-xs">Proteinmål (g/dag)</label>
            <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={proteinGoalMode === 'auto'}
                onChange={e => handleProteinModeToggle(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent"
              />
              Räkna automatiskt
            </label>
          </div>
          {proteinGoalMode === 'auto' ? (
            <div className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm flex items-center justify-between">
              <span className="font-mono text-fg">{proteinGoalG.trim() ? `${proteinGoalG} g` : '– g'}</span>
              <span className="text-muted text-[11px]">beräknas varje söndag utifrån ditt viktsnitt</span>
            </div>
          ) : (
            <input type="number" min={0} step={5} inputMode="numeric" value={proteinGoalG} onChange={e => setProteinGoalG(e.target.value)} placeholder="t.ex. 150" className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors" />
          )}
          {proteinRefreezeMsg && <p className="text-muted text-xs mt-1.5">{proteinRefreezing ? 'Räknar om...' : proteinRefreezeMsg}</p>}
        </div>
      )}
      {trackedMetrics.includes('carb') && (
        <div>
          <label className="text-muted text-xs block mb-1.5">Kolhydratmål (g/dag)</label>
          <input type="number" min={0} step={5} inputMode="numeric" value={carbGoalG} onChange={e => setCarbGoalG(e.target.value)} placeholder="t.ex. 250" className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors" />
        </div>
      )}
      {trackedMetrics.includes('fat') && (
        <div>
          <label className="text-muted text-xs block mb-1.5">Fettmål (g/dag)</label>
          <input type="number" min={0} step={5} inputMode="numeric" value={fatGoalG} onChange={e => setFatGoalG(e.target.value)} placeholder="t.ex. 70" className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors" />
        </div>
      )}
      {trackedMetrics.includes('kcal') && !hasCalorieGoal && (
        <p className="text-amber-400 text-xs -mt-2">Ange ett dagligt kalorimål i Profil under &quot;Kropp &amp; kalorier&quot; (eller sätt upp ett viktmål) för att kalorier ska räknas med i kalendern.</p>
      )}

      <div>
        <label className="text-muted text-xs block mb-2">Vilka måltider vill du logga?</label>
        <div className="flex flex-wrap gap-2">
          {KOST_MEALS.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMeal(m)}
              className={`text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${trackedMeals.includes(m) ? 'bg-accent/10 text-accent border-accent/30' : 'border-edge text-fg hover:border-accent/30'}`}
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
          checked={remindersEnabled}
          onChange={e => setRemindersEnabled(e.target.checked)}
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

      {saveError && <p className="text-red-400 text-xs">{saveError}</p>}
      <button type="button" onClick={save} disabled={saving} className="bg-accent text-bg font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 self-start px-6">
        {saving ? 'Sparar...' : saved ? '✓ Sparat' : 'Spara inställningar'}
      </button>
    </div>
  )
}
