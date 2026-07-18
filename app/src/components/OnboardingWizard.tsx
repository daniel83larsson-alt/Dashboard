'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'
import { ChipPicker, COMMON_EQUIPMENT, COMMON_SPORTS } from '@/components/ChipPicker'

type Step = 'intro' | 'goals' | 'context' | 'equipment'

const VISIBLE_STEPS: Step[] = ['goals', 'context', 'equipment']

const CONTEXT_PLACEHOLDER = 'T.ex. jobb och livssituation, vad som motiverar dig, skador eller begränsningar att ta hänsyn till.'

// Guided 3-step onboarding (mål → om dig → utrustning/aktiviteter) reached
// either by clicking the checklist's own trigger, or auto-opened once a
// month has passed with nothing filled in — same flow, different framing.
// Each step saves immediately so a half-finished wizard still keeps
// whatever was filled in if the user closes partway through.
export default function OnboardingWizard({
  autoOpen = false,
  initialOverview,
  initialContext,
  initialEquipment,
  initialSports,
  triggerLabel = 'Snabbstart →',
}: {
  autoOpen?: boolean
  initialOverview: string
  initialContext: string
  initialEquipment: string[]
  initialSports: string[]
  triggerLabel?: string
}) {
  const [open, setOpen] = useState(autoOpen)
  const [step, setStep] = useState<Step>(autoOpen ? 'intro' : 'goals')
  const [overview, setOverview] = useState(initialOverview)
  const [goalTitle, setGoalTitle] = useState('')
  const [goalType, setGoalType] = useState<'metric' | 'event' | 'habit'>('metric')
  const [goalDate, setGoalDate] = useState('')
  const [context, setContext] = useState(initialContext)
  const [equipment, setEquipment] = useState<string[]>(initialEquipment)
  const [sports, setSports] = useState<string[]>(initialSports)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function closeWizard() {
    setOpen(false)
    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('profiles').update({ onboarding_dismissed_at: new Date().toISOString() }).eq('id', user.id)
    router.refresh()
  }

  async function saveGoalsStep() {
    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (overview.trim() && overview !== initialOverview) {
      await fetch('/api/goals/save-overview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overview }),
      })
    }
    if (goalTitle.trim()) {
      await supabase.from('goals').insert({
        user_id: user.id, sport_type: 'Rowing', goal_type: goalType, title: goalTitle.trim(),
        target_date: goalDate || null, status: 'active',
      })
    }
  }

  async function saveContextStep() {
    if (context.trim() && context !== initialContext) {
      await fetch('/api/context/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context }),
      })
    }
  }

  async function saveEquipmentStep() {
    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({ home_equipment: equipment, selected_sports: sports }).eq('id', user.id)
  }

  async function goNext() {
    setSaving(true)
    try {
      if (step === 'goals') await saveGoalsStep()
      if (step === 'context') await saveContextStep()
      if (step === 'equipment') await saveEquipmentStep()
    } finally {
      setSaving(false)
    }
    const nextIndex = VISIBLE_STEPS.indexOf(step) + 1
    if (nextIndex >= VISIBLE_STEPS.length) {
      closeWizard()
    } else {
      setStep(VISIBLE_STEPS[nextIndex])
    }
  }

  function skipStep() {
    const nextIndex = VISIBLE_STEPS.indexOf(step) + 1
    if (nextIndex >= VISIBLE_STEPS.length) {
      closeWizard()
    } else {
      setStep(VISIBLE_STEPS[nextIndex])
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setStep('goals'); setOpen(true) }}
        className="inline-block mt-3 text-xs text-accent hover:underline"
      >
        {triggerLabel}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="bg-card border border-edge rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-5">
        {step === 'intro' && (
          <div className="flex flex-col gap-3">
            <div className="text-lg font-semibold">Hjälp coachen hjälpa dig</div>
            <p className="text-muted text-sm leading-relaxed">
              Det har gått en månad utan att mål, bakgrund eller utrustning är ifyllt. Utan det gissar coach-teamet
              — en användare fick nyligen ett träningstips baserat på utrustning hen inte hade hemma. Tre snabba
              steg (under en minut) gör att råden faktiskt passar din situation.
            </p>
            <button
              type="button"
              onClick={() => setStep('goals')}
              className="bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
            >
              Kör igång
            </button>
            <button type="button" onClick={closeWizard} className="text-muted text-xs hover:text-fg transition-colors self-center">
              Inte nu
            </button>
          </div>
        )}

        {step !== 'intro' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted uppercase tracking-wider">
                Steg {VISIBLE_STEPS.indexOf(step) + 1} av {VISIBLE_STEPS.length}
              </div>
              <button type="button" onClick={closeWizard} className="text-muted text-xs hover:text-fg">Stäng</button>
            </div>

            {step === 'goals' && (
              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium">Vad är ditt mål?</div>
                <textarea
                  value={overview}
                  onChange={e => setOverview(e.target.value)}
                  placeholder="T.ex. hållbar träning, undvika skador, ett specifikt resultat..."
                  rows={3}
                  className="w-full bg-bg border border-edge rounded-xl px-3 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent resize-none"
                />
                <div className="text-xs text-muted">Vill du sätta ett konkret mål också? (valfritt)</div>
                <input
                  value={goalTitle}
                  onChange={e => setGoalTitle(e.target.value)}
                  placeholder="T.ex. 5000m under 22 min"
                  className="w-full bg-bg border border-edge rounded-xl px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent"
                />
                {goalTitle.trim() && (
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={goalType}
                      onChange={e => setGoalType(e.target.value as typeof goalType)}
                      className="w-full bg-bg border border-edge rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
                    >
                      <option value="metric">Resultat</option>
                      <option value="event">Tävling</option>
                      <option value="habit">Vana</option>
                    </select>
                    <input
                      type="date"
                      value={goalDate}
                      onChange={e => setGoalDate(e.target.value)}
                      className="w-full bg-bg border border-edge rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
                    />
                  </div>
                )}
              </div>
            )}

            {step === 'context' && (
              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium">Berätta lite om dig</div>
                <p className="text-muted text-xs">Jobb, livssituation, personlighet, skador — allt som hjälper AI:n förstå helheten.</p>
                <textarea
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  placeholder={CONTEXT_PLACEHOLDER}
                  rows={5}
                  className="w-full bg-bg border border-edge rounded-xl px-3 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent resize-none leading-relaxed"
                />
              </div>
            )}

            {step === 'equipment' && (
              <div className="flex flex-col gap-4">
                <div className="text-sm font-medium">Utrustning & aktiviteter</div>
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
            )}

            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={skipStep}
                disabled={saving}
                className="flex-1 text-xs bg-bg border border-edge px-4 py-2.5 rounded-xl text-muted hover:border-accent/40 transition-colors disabled:opacity-50"
              >
                Hoppa över
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={saving}
                className="flex-1 bg-accent text-bg text-sm font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed"
              >
                {saving ? 'Sparar...' : (step === 'equipment' ? 'Klar' : 'Nästa')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
