import { startOfWeek, stockholmDateKey } from './dates'

const DAY_MS = 86400000

export type Habit = { id: string; title: string; interval_days: number; created_at: string; active: boolean }
export type HabitLog = { habit_id: string; done_date: string }

export const INTERVAL_PRESETS = [
  { days: 1, label: 'Varje dag' },
  { days: 7, label: 'Varje vecka' },
] as const

export function intervalLabel(days: number): string {
  const preset = INTERVAL_PRESETS.find(p => p.days === days)
  if (preset) return preset.label
  return `Var ${days}:e dag`
}

// Gives every habit a stable, distinct visual identity shared between
// HabitsCard's checkbox and ActivityCalendar's dots/legend — so "Kreatin"
// is always the same color everywhere instead of every habit looking like
// a generic "vana" (Daniel: vill kunna se VILKEN vana i kalendern, och
// tydligare rader i Vanor-kortet). Cycles past 4 habits rather than
// erroring — a rare case, not worth a bigger palette for.
// Every class below is a complete, static literal (never built by string
// concatenation) so Tailwind's content scanner can actually find them —
// a template string like `${color.border}/30` would never generate CSS.
const HABIT_COLORS = [
  { bg: 'bg-habit', border: 'border-habit', borderMuted: 'border-habit/30', hoverBorder: 'hover:border-habit', text: 'text-habit' },
  { bg: 'bg-lcd', border: 'border-lcd', borderMuted: 'border-lcd/30', hoverBorder: 'hover:border-lcd', text: 'text-lcd' },
  { bg: 'bg-amber-400', border: 'border-amber-400', borderMuted: 'border-amber-400/30', hoverBorder: 'hover:border-amber-400', text: 'text-amber-400' },
  { bg: 'bg-accent', border: 'border-accent', borderMuted: 'border-accent/30', hoverBorder: 'hover:border-accent', text: 'text-accent' },
] as const

export function habitColor(index: number) {
  return HABIT_COLORS[index % HABIT_COLORS.length]
}

function toDayKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

// Which "period" a date falls into for a given habit's interval — daily
// habits use the plain calendar date, weekly ones align to the same
// Monday-start week as the rest of the app (Veckoplan/streaks), and any
// other custom interval counts fixed-length blocks anchored to the day the
// habit was created (so "var 3:e dag" always lands on the same weekday
// pattern relative to when you started it, not a moving calendar window).
export function periodKey(habit: Pick<Habit, 'interval_days' | 'created_at'>, date: Date): string {
  if (habit.interval_days === 1) return stockholmDateKey(date)
  if (habit.interval_days === 7) return toDayKey(startOfWeek(date))

  const anchor = new Date(habit.created_at)
  anchor.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  const daysSinceAnchor = Math.floor((target.getTime() - anchor.getTime()) / DAY_MS)
  const periodIndex = Math.floor(daysSinceAnchor / habit.interval_days)
  const periodStart = new Date(anchor.getTime() + periodIndex * habit.interval_days * DAY_MS)
  return toDayKey(periodStart)
}

// All distinct periods between the habit's creation and `now`, oldest
// first — the denominator for "N av M dagar/veckor" on Insikter and the
// loop bound for the streak walk-back below.
function periodsSinceCreation(habit: Pick<Habit, 'interval_days' | 'created_at'>, now: Date): string[] {
  const created = new Date(habit.created_at)
  const keys: string[] = []
  const cursor = new Date(created)
  cursor.setHours(0, 0, 0, 0)
  const nowKey = periodKey(habit, now)
  let guard = 0
  while (guard++ < 20000) { // ~54 years of daily periods — plenty of headroom, never actually reached
    const key = periodKey(habit, cursor)
    if (keys[keys.length - 1] !== key) keys.push(key)
    if (key === nowKey) break
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

export function isDoneInCurrentPeriod(habit: Habit, logs: HabitLog[], now = new Date()): boolean {
  const currentKey = periodKey(habit, now)
  return logs.some(l => periodKey(habit, new Date(l.done_date)) === currentKey)
}

// Consecutive completed periods walking back from the most recent one —
// same "grace" rule as the training streaks: if the CURRENT period isn't
// done yet that's fine (it's still open), but if the most recent logged
// period is more than one period old, the streak is dead (0), not stale.
export function currentHabitStreak(habit: Habit, logs: HabitLog[], now = new Date()): number {
  if (!logs.length) return 0
  const doneKeys = [...new Set(logs.map(l => periodKey(habit, new Date(l.done_date))))]
  const allPeriods = periodsSinceCreation(habit, now)
  const doneSet = new Set(doneKeys)

  let streak = 0
  for (let i = allPeriods.length - 1; i >= 0; i--) {
    const key = allPeriods[i]
    const isCurrent = i === allPeriods.length - 1
    if (doneSet.has(key)) {
      streak++
    } else if (isCurrent) {
      continue // today's/this period's window is still open — doesn't break the streak yet
    } else {
      break
    }
  }
  return streak
}

// "N av M" completion — Daniel: "30 av 30 dagar. 7 av 8 veckor."
export function habitCompletionStats(habit: Habit, logs: HabitLog[], now = new Date()): { done: number; total: number } {
  const allPeriods = periodsSinceCreation(habit, now)
  const doneKeys = new Set(logs.map(l => periodKey(habit, new Date(l.done_date))))
  const done = allPeriods.filter(k => doneKeys.has(k)).length
  return { done, total: allPeriods.length }
}
