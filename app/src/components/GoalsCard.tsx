'use client'

import { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Goal = {
  id: string
  goal_type: 'event' | 'metric' | 'habit'
  title: string
  description: string | null
  target_date: string | null
  sessions_per_week: number | null
}

const TYPE_LABEL: Record<Goal['goal_type'], string> = {
  event: 'Tävling',
  metric: 'Resultat',
  habit: 'Vana',
}

export default function GoalsCard({ goals, savedOverview }: { goals: Goal[]; savedOverview: string }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [goalType, setGoalType] = useState<Goal['goal_type']>('metric')
  const [targetDate, setTargetDate] = useState('')
  const [sessionsPerWeek, setSessionsPerWeek] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [overview, setOverview] = useState(savedOverview)
  const [overviewSaving, setOverviewSaving] = useState(false)
  const [overviewSaved, setOverviewSaved] = useState(false)
  const router = useRouter()

  async function saveOverview() {
    setOverviewSaving(true)
    try {
      await fetch('/api/goals/save-overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overview }),
      })
      setOverviewSaved(true)
      setTimeout(() => setOverviewSaved(false), 2000)
      router.refresh()
    } finally {
      setOverviewSaving(false)
    }
  }

  async function addGoal(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')

    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Inte inloggad'); setSaving(false); return }

    const { error: insertError } = await supabase.from('goals').insert({
      user_id: user.id,
      sport_type: 'Rowing',
      goal_type: goalType,
      title: title.trim(),
      description: description.trim() || null,
      target_date: targetDate || null,
      sessions_per_week: sessionsPerWeek ? Number(sessionsPerWeek) : null,
      status: 'active',
    })

    if (insertError) {
      setError('Kunde inte spara målet')
    } else {
      setTitle(''); setTargetDate(''); setSessionsPerWeek(''); setDescription('')
      setOpen(false)
      router.refresh()
    }
    setSaving(false)
  }

  async function updateStatus(id: string, status: 'achieved' | 'paused') {
    const supabase = createSupabaseClient()
    await supabase.from('goals').update({ status }).eq('id', id)
    router.refresh()
  }

  async function removeGoal(id: string) {
    const supabase = createSupabaseClient()
    await supabase.from('goals').delete().eq('id', id)
    router.refresh()
  }

  return (
    <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted uppercase tracking-wider">Mål</div>
          <p className="text-muted text-xs mt-0.5">Styr träningsplanen och coachens råd</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="text-xs bg-bg border border-edge px-3 py-1.5 rounded-lg text-fg hover:border-accent transition-colors"
        >
          {open ? 'Avbryt' : '+ Nytt mål'}
        </button>
      </div>

      <div>
        <label className="text-muted text-xs block mb-1.5">Övergripande mål (fritext)</label>
        <p className="text-muted text-[11px] mb-1.5">För sånt som inte passar en konkret siffra eller ett datum — t.ex. &quot;hållbar träning&quot;, &quot;undvika skador&quot;, &quot;ha kul&quot;</p>
        <textarea
          value={overview}
          onChange={e => setOverview(e.target.value)}
          placeholder="T.ex. Hållbar träning över tid, inte maximal prestation just nu. Prioritera att undvika skador framför snabba resultat."
          rows={3}
          className="w-full bg-bg border border-edge rounded-xl px-3 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors resize-none leading-relaxed"
        />
        <button
          type="button"
          onClick={saveOverview}
          disabled={overviewSaving || overview === savedOverview}
          className="mt-2 text-xs bg-bg border border-edge px-3 py-1.5 rounded-lg text-fg disabled:opacity-40 hover:border-accent transition-colors"
        >
          {overviewSaved ? '✓ Sparat' : overviewSaving ? 'Sparar...' : 'Spara'}
        </button>
      </div>

      <div className="border-t border-edge pt-3" />

      {goals.length === 0 && !open && (
        <p className="text-muted text-xs">Inga aktiva mål. Lägg till ett så anpassar coachen och veckoplanen sig efter det.</p>
      )}

      {goals.length > 0 && (
        <div className="flex flex-col gap-2">
          {goals.map(g => (
            <div key={g.id} className="bg-bg rounded-xl p-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-card border border-edge text-muted px-1.5 py-0.5 rounded">{TYPE_LABEL[g.goal_type]}</span>
                  {g.target_date && (
                    <span className="text-[10px] text-muted">
                      {new Date(g.target_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
                <div className="text-sm text-fg mt-1 truncate">{g.title}</div>
                {g.description && <div className="text-xs text-muted mt-0.5">{g.description}</div>}
                {g.sessions_per_week && <div className="text-xs text-muted mt-0.5">{g.sessions_per_week} pass/vecka</div>}
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button type="button" onClick={() => updateStatus(g.id, 'achieved')} className="text-[10px] text-accent hover:underline">Klar</button>
                <button type="button" onClick={() => removeGoal(g.id)} className="text-[10px] text-muted hover:text-red-400">Ta bort</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <form onSubmit={addGoal} className="flex flex-col gap-3 pt-1 border-t border-edge mt-1">
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
              <label className="text-muted text-xs block mb-1.5">Titel</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="T.ex. 5000m under 22 min"
                required
                className="w-full bg-bg border border-edge rounded-xl px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-muted text-xs block mb-1.5">Typ</label>
              <select
                value={goalType}
                onChange={e => setGoalType(e.target.value as Goal['goal_type'])}
                className="w-full bg-bg border border-edge rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
              >
                <option value="metric">Resultat</option>
                <option value="event">Tävling</option>
                <option value="habit">Vana</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-muted text-xs block mb-1.5">Måldatum (valfritt)</label>
              <input
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                className="w-full bg-bg border border-edge rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-muted text-xs block mb-1.5">Pass/vecka (valfritt)</label>
              <input
                type="number"
                min={1}
                max={14}
                value={sessionsPerWeek}
                onChange={e => setSessionsPerWeek(e.target.value)}
                placeholder="3"
                className="w-full bg-bg border border-edge rounded-xl px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div>
            <label className="text-muted text-xs block mb-1.5">Beskrivning (valfritt)</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Mer detaljer om målet"
              className="w-full bg-bg border border-edge rounded-xl px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent"
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="bg-accent text-bg text-xs font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {saving ? 'Sparar...' : 'Spara mål'}
          </button>
        </form>
      )}
    </div>
  )
}
