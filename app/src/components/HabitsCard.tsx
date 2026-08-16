'use client'

import { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { isDoneInCurrentPeriod, currentHabitStreak, intervalLabel, type Habit, type HabitLog } from '@/lib/habits'

export default function HabitsCard({ habits, logs }: { habits: Habit[]; logs: HabitLog[] }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [intervalDays, setIntervalDays] = useState('1')
  const [customDays, setCustomDays] = useState('3')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const router = useRouter()

  const logsByHabit = new Map<string, HabitLog[]>()
  for (const l of logs) {
    const list = logsByHabit.get(l.habit_id) ?? []
    list.push(l)
    logsByHabit.set(l.habit_id, list)
  }

  async function addHabit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')

    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Inte inloggad'); setSaving(false); return }

    const days = intervalDays === 'custom' ? Number(customDays) : Number(intervalDays)
    if (!days || days < 1) { setError('Ange ett giltigt antal dagar'); setSaving(false); return }

    const { error: insertError } = await supabase.from('habits').insert({
      user_id: user.id,
      title: title.trim(),
      interval_days: days,
      active: true,
    })

    if (insertError) {
      setError('Kunde inte spara vanan')
    } else {
      setTitle(''); setIntervalDays('1'); setCustomDays('3')
      setOpen(false)
      router.refresh()
    }
    setSaving(false)
  }

  async function toggle(habit: Habit) {
    // Går via en route (istället för en direkt klient-insert som tidigare)
    // så ett nyckryssat streak-milstolpe kan trigga en push omedelbart —
    // se api/habits/toggle.
    setPending(habit.id)
    await fetch('/api/habits/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ habitId: habit.id }),
    })
    router.refresh()
    setPending(null)
  }

  async function removeHabit(id: string) {
    const supabase = createSupabaseClient()
    await supabase.from('habits').update({ active: false }).eq('id', id)
    router.refresh()
  }

  return (
    <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted uppercase tracking-wider">Vanor</div>
          <p className="text-muted text-xs mt-0.5">Kryssa av — påminner dig bara om det som inte är gjort</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="text-xs bg-bg border border-edge px-3 py-1.5 rounded-lg text-fg hover:border-accent transition-colors"
        >
          {open ? 'Avbryt' : '+ Ny vana'}
        </button>
      </div>

      {habits.length === 0 && !open && (
        <p className="text-muted text-xs">Inga vanor än. Lägg till t.ex. &quot;Kreatin&quot; eller &quot;Protein&quot; så håller appen koll.</p>
      )}

      {habits.length > 0 && (
        <div className="flex flex-col gap-2">
          {habits.map(h => {
            const habitLogs = logsByHabit.get(h.id) ?? []
            const done = isDoneInCurrentPeriod(h, habitLogs)
            const streak = currentHabitStreak(h, habitLogs)
            return (
              <div key={h.id} className="bg-bg rounded-xl p-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggle(h)}
                  disabled={pending === h.id}
                  aria-label={done ? `Ångra ${h.title}` : `Markera ${h.title} som gjord`}
                  className={`w-6 h-6 flex-shrink-0 rounded-lg border flex items-center justify-center text-xs font-bold transition-colors disabled:opacity-50 ${
                    done ? 'bg-habit border-habit text-bg' : 'border-edge text-transparent hover:border-habit'
                  }`}
                >
                  ✓
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-fg truncate">{h.title}</div>
                  <div className="text-[10px] text-muted mt-0.5">
                    {intervalLabel(h.interval_days)}
                    {streak > 0 && <span className="text-habit"> · {streak} i rad</span>}
                  </div>
                </div>
                <button type="button" onClick={() => removeHabit(h.id)} className="text-[10px] text-muted hover:text-red-400 flex-shrink-0">Ta bort</button>
              </div>
            )
          })}
        </div>
      )}

      {open && (
        <form onSubmit={addHabit} className="flex flex-col gap-3 pt-3 border-t border-edge mt-1">
          <div>
            <label className="text-muted text-xs block mb-1.5">Vad vill du hålla koll på?</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="T.ex. Kreatin, Protein, Stretch"
              required
              className="w-full bg-bg border border-edge rounded-xl px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-muted text-xs block mb-1.5">Hur ofta</label>
              <select
                value={intervalDays}
                onChange={e => setIntervalDays(e.target.value)}
                className="w-full bg-bg border border-edge rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
              >
                <option value="1">Varje dag</option>
                <option value="7">Varje vecka</option>
                <option value="custom">Eget intervall</option>
              </select>
            </div>
            {intervalDays === 'custom' && (
              <div>
                <label className="text-muted text-xs block mb-1.5">Var N:e dag</label>
                <input
                  type="number"
                  min={2}
                  max={90}
                  value={customDays}
                  onChange={e => setCustomDays(e.target.value)}
                  className="w-full bg-bg border border-edge rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
                />
              </div>
            )}
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="bg-accent text-bg text-xs font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {saving ? 'Sparar...' : 'Spara vana'}
          </button>
        </form>
      )}
    </div>
  )
}
