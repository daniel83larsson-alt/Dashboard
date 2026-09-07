'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { startOfWeek, stockholmDateKey } from '@/lib/dates'
import { habitColor, type Habit, type HabitLog } from '@/lib/habits'

const MOBILITY_WEEKLY_GOAL = 2
// Matches the server-side window in api/habits/toggle — a day outside this
// isn't clickable here at all, so there's no dead-end tap that silently
// fails against the route's own validation.
const HABIT_BACKDATE_DAYS = 7

type Props = {
  trainedDates: string[] // ISO date strings
  mobilityDates?: string[] // ISO date strings — subset of trainedDates, marked with a second color
  plannedDates?: string[] // ISO date strings — planned-but-not-yet-done sessions from the weekly plan
  habits?: Habit[]
  habitLogs?: HabitLog[]
}

export default function ActivityCalendar({ trainedDates, mobilityDates = [], plannedDates = [], habits = [], habitLogs = [] }: Props) {
  const router = useRouter()
  const today = new Date()
  const todayKey = stockholmDateKey()
  const weekStart = startOfWeek(today)
  const mobilityThisWeek = mobilityDates.filter(d => new Date(d) >= weekStart).length
  const mobilityGoalMet = mobilityThisWeek >= MOBILITY_WEEKLY_GOAL
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const earliestEditableKey = new Date(new Date(`${todayKey}T00:00:00`).getTime() - (HABIT_BACKDATE_DAYS - 1) * 86400000).toISOString().slice(0, 10)

  const viewDate = new Date(viewYear, viewMonth, 1)
  const monthName = viewDate.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()
  // sv-SE week starts Monday: 0=Mon…6=Sun; JS getDay 0=Sun
  const startOffset = (firstWeekday + 6) % 7

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth()

  const trained = new Set(
    trainedDates.map(d => new Date(d).toLocaleDateString('sv-SE'))
  )
  const mobility = new Set(
    mobilityDates.map(d => new Date(d).toLocaleDateString('sv-SE'))
  )
  const planned = new Set(
    plannedDates.map(d => new Date(d).toLocaleDateString('sv-SE'))
  )

  // dateKey (YYYY-MM-DD) → indices into `habits` that were done that day —
  // index-based so the same habit always gets the same color here and in
  // HabitsCard (both read the same server-ordered `habits` array).
  const habitIndexByDate = new Map<string, number[]>()
  for (const log of habitLogs) {
    const idx = habits.findIndex(h => h.id === log.habit_id)
    if (idx === -1) continue
    const list = habitIndexByDate.get(log.done_date) ?? []
    if (!list.includes(idx)) list.push(idx)
    habitIndexByDate.set(log.done_date, list)
  }

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const dayLabels = ['M', 'T', 'O', 'T', 'F', 'L', 'S']

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  async function toggleHabitOnDate(habitId: string, dateKey: string) {
    const key = `${habitId}:${dateKey}`
    setPending(key)
    await fetch('/api/habits/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ habitId, date: dateKey }),
    })
    router.refresh()
    setPending(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs text-muted uppercase tracking-wider capitalize">{monthName}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            aria-label="Föregående månad"
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-card transition-colors"
          >
            ‹
          </button>
          {!isCurrentMonth && (
            <button
              onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()) }}
              className="text-[10px] text-accent px-1.5 hover:underline"
            >
              idag
            </button>
          )}
          <button
            onClick={nextMonth}
            aria-label="Nästa månad"
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-card transition-colors"
          >
            ›
          </button>
        </div>
      </div>
      <div className="bg-card border border-edge rounded-2xl p-4">
        {/* Cells are fixed-size, so this stays compact instead of stretching
            into oversized squares when the card spans a wide desktop column. */}
        <div className="max-w-xs mx-auto">
          {/* Day labels */}
          <div className="grid grid-cols-7 mb-2">
            {dayLabels.map((d, i) => (
              <div key={i} className="text-center text-muted text-xs pb-1">{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />
              const cellDate = new Date(viewYear, viewMonth, day)
              const dateStr = cellDate.toLocaleDateString('sv-SE')
              const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isToday = isCurrentMonth && day === today.getDate()
              const hasTrained = trained.has(dateStr)
              const hasMobility = mobility.has(dateStr)
              // Ghost marker for a planned-but-not-yet-done session — turns
              // into the solid "trained" fill above once the matching
              // activity is logged/matched, so this only ever shows for the
              // still-open gap between planned and done.
              const hasPlanned = !hasTrained && planned.has(dateStr)
              const habitIndices = habitIndexByDate.get(dateKey) ?? []
              const isFuture = cellDate > today
              const isHabitEditable = habits.length > 0 && dateKey >= earliestEditableKey && dateKey <= todayKey

              return (
                <div key={i} className="flex items-center justify-center h-10">
                  <button
                    type="button"
                    disabled={!isHabitEditable}
                    onClick={() => setSelectedDateKey(dateKey)}
                    aria-label={isHabitEditable ? `Vanor för ${dateKey}` : undefined}
                    className={`
                      w-8 h-8 flex items-center justify-center rounded-lg text-xs font-mono relative transition-colors
                      ${isHabitEditable ? 'cursor-pointer hover:bg-bg' : 'cursor-default'}
                      ${isToday ? 'ring-1 ring-accent' : ''}
                      ${hasTrained ? 'bg-accent/20 text-accent font-bold' : hasPlanned ? 'border border-dashed border-accent/50 text-muted' : isFuture ? 'text-muted/40' : 'text-muted'}
                    `}
                  >
                    {hasTrained && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-accent" />
                    )}
                    {hasMobility && (
                      <span className="absolute bottom-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-lcd" />
                    )}
                    {habitIndices.length > 0 && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                        {habitIndices.map(idx => (
                          <span key={idx} className={`w-1.5 h-1.5 rounded-full ${habitColor(idx).bg}`} />
                        ))}
                      </span>
                    )}
                    {day}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-edge flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-accent" />
            <span className="text-xs text-muted">Tränat</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-lcd" />
            <span className="text-xs text-muted">Rörlighet</span>
          </div>
          {habits.map((h, idx) => (
            <div key={h.id} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${habitColor(idx).bg}`} />
              <span className="text-xs text-muted">{h.title}</span>
            </div>
          ))}
          {plannedDates.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full border border-dashed border-accent/50" />
              <span className="text-xs text-muted">Planerat</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-lg ring-1 ring-accent" />
            <span className="text-xs text-muted">Idag</span>
          </div>
          <div className={`ml-auto text-xs font-mono ${mobilityGoalMet ? 'text-lcd' : 'text-muted'}`}>
            {mobilityGoalMet ? '✓ ' : ''}Rörlighet {mobilityThisWeek}/{MOBILITY_WEEKLY_GOAL} denna vecka
          </div>
        </div>
        {habits.length > 0 && (
          <p className="text-muted text-[10px] mt-2">Tryck på en av de senaste {HABIT_BACKDATE_DAYS} dagarna för att kryssa i eller ångra en vana.</p>
        )}
      </div>

      {/* Vana-dagdrawer — kryssa i/ångra en vana i efterhand om man missat
          en dag. Bara de senaste 7 dagarna är klickbara (samma gräns som
          api/habits/toggle redan sätter server-side). */}
      {selectedDateKey && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-end justify-center" onClick={() => setSelectedDateKey(null)}>
          <div className="bg-card border border-edge border-b-0 rounded-t-2xl p-4 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 bg-edge rounded-full mx-auto mb-4" />
            <div className="text-base font-bold mb-3">
              {new Date(`${selectedDateKey}T00:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <div className="flex flex-col gap-2">
              {habits.map((h, idx) => {
                const color = habitColor(idx)
                const done = habitLogs.some(l => l.habit_id === h.id && l.done_date === selectedDateKey)
                const isPending = pending === `${h.id}:${selectedDateKey}`
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => toggleHabitOnDate(h.id, selectedDateKey)}
                    disabled={isPending}
                    className="bg-bg rounded-xl p-3 flex items-center gap-3 text-left disabled:opacity-50"
                  >
                    <span
                      className={`w-6 h-6 flex-shrink-0 rounded-lg border flex items-center justify-center text-xs font-bold transition-colors ${
                        done ? `${color.bg} ${color.border} text-bg` : `${color.borderMuted} text-transparent`
                      }`}
                    >
                      ✓
                    </span>
                    <span className="text-sm text-fg">{h.title}</span>
                  </button>
                )
              })}
            </div>
            <button onClick={() => setSelectedDateKey(null)} className="text-muted text-xs mt-4 w-full text-center">Stäng</button>
          </div>
        </div>
      )}
    </div>
  )
}
