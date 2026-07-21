// Pure computation for "Veckans Recap" — the holistic weekly digest (no AI,
// no I/O). Given a week's deduped activities, wellness history, and that
// week's/next week's plan_sessions, produces the numbers the digest is
// built from. Callers (the in-app card and the Sunday email job) both
// generate an AI narrative FROM this output — this file never talks to
// Gemini and never writes anything back to the database.
import { dedupeForStats, type ActivityRow } from './duplicates'
import { sportLabel } from './sport'
import type { DayWellness } from './garmin-sync'

export type PlanSessionRow = {
  planned_date: string // YYYY-MM-DD
  is_rest: boolean
  sport_type: string | null
  title: string
}

export type WeeklyDigestSessionStats = {
  count: number
  totalKm: number
  totalMinutes: number
  bySport: { sport: string; label: string; count: number }[]
}

export type WeeklyDigestWellnessStats = {
  avgSteps: number | null
  avgSleepHours: number | null
  avgRestingHR: number | null
  avgHrv: number | null
}

export type WeeklyDigestAdherence = {
  plannedCount: number
  doneCount: number
  label: string
} | null

export type WeeklyDigestLookAhead =
  | { kind: 'plan'; sessions: { sport: string | null; label: string; title: string; plannedDate: string; isRest: boolean }[] }
  | { kind: 'none' }

export type WeeklyDigestData = {
  weekStartISO: string
  weekEndISO: string
  thisWeek: { sessions: WeeklyDigestSessionStats; wellness: WeeklyDigestWellnessStats }
  prevWeek: { sessions: WeeklyDigestSessionStats; wellness: WeeklyDigestWellnessStats }
  adherence: WeeklyDigestAdherence
  lookAhead: WeeklyDigestLookAhead
}

function isoDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function sessionStats(activities: ActivityRow[]): WeeklyDigestSessionStats {
  const bySportCount = new Map<string, number>()
  let totalDistance = 0
  let totalSeconds = 0
  for (const a of activities) {
    bySportCount.set(a.sport_type, (bySportCount.get(a.sport_type) ?? 0) + 1)
    totalDistance += a.distance ?? 0
    totalSeconds += a.moving_time ?? 0
  }
  const bySport = [...bySportCount.entries()]
    .map(([sport, count]) => ({ sport, label: sportLabel(sport), count }))
    .sort((a, b) => b.count - a.count)
  return {
    count: activities.length,
    totalKm: Math.round((totalDistance / 1000) * 10) / 10,
    totalMinutes: Math.round(totalSeconds / 60),
    bySport,
  }
}

// wellnessHistory dates are plain "YYYY-MM-DD" strings — lexical comparison
// against other ISO date keys sorts correctly without any timezone math.
function wellnessStats(wellnessHistory: DayWellness[], startKey: string, endKeyInclusive: string): WeeklyDigestWellnessStats {
  const days = wellnessHistory.filter(d => d.date >= startKey && d.date <= endKeyInclusive)
  const avg = (key: keyof DayWellness): number | null => {
    const vals = days.map(d => d[key]).filter((v): v is number => typeof v === 'number')
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  }
  return {
    avgSteps: avg('steps'),
    avgSleepHours: avg('sleepHours'),
    avgRestingHR: avg('restingHR'),
    avgHrv: avg('hrv'),
  }
}

// Greedy, week-level, sport-only match — deliberately looser than the
// deferred reconcilePlanWeek job (no day-of-week tolerance check, no
// distance/time comparison): a planned session counts as done if there's
// any unclaimed activity of the same sport_type anywhere in the same week,
// which already covers "moved the session to a different day" for free.
// Purely computed for this digest — never persisted back to plan_sessions.
export function matchAdherence(planned: PlanSessionRow[], activities: ActivityRow[]): WeeklyDigestAdherence {
  const nonRest = planned.filter(p => !p.is_rest && p.sport_type)
  if (!nonRest.length) return null
  const unclaimed = [...activities]
  let done = 0
  for (const p of nonRest) {
    const idx = unclaimed.findIndex(a => a.sport_type === p.sport_type)
    if (idx !== -1) {
      done++
      unclaimed.splice(idx, 1)
    }
  }
  return { plannedCount: nonRest.length, doneCount: done, label: `${done} av ${nonRest.length} planerade pass gjorda` }
}

export function computeWeeklyDigest({
  weekStart,
  activities,
  wellnessHistory,
  planSessionsThisWeek,
  planSessionsNextWeek,
}: {
  weekStart: Date // Monday 00:00 of the week being recapped (the week that just ended)
  activities: ActivityRow[] // raw, not yet deduped — this function dedupes internally
  wellnessHistory: DayWellness[]
  planSessionsThisWeek: PlanSessionRow[]
  planSessionsNextWeek: PlanSessionRow[]
}): WeeklyDigestData {
  // weekEndExclusive is next Monday 00:00 — activities are timestamps with a
  // time-of-day, so the upper bound must be exclusive (a Sunday-evening
  // session is still very much "this week"). weekEndDisplay/prevWeekEnd are
  // only used for the human-facing date range and the wellness lookup below
  // (which compares plain YYYY-MM-DD date keys, not timestamps, so an
  // inclusive Sunday date there is correct).
  const weekEndExclusive = new Date(weekStart)
  weekEndExclusive.setDate(weekEndExclusive.getDate() + 7)
  const weekEndDisplay = new Date(weekStart)
  weekEndDisplay.setDate(weekEndDisplay.getDate() + 6)
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)
  const prevWeekEnd = new Date(weekStart)
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 1)

  const deduped = dedupeForStats(activities)
  const thisWeekActs = deduped.filter(a => new Date(a.start_date) >= weekStart && new Date(a.start_date) < weekEndExclusive)
  const prevWeekActs = deduped.filter(a => new Date(a.start_date) >= prevWeekStart && new Date(a.start_date) < weekStart)

  const weekStartKey = isoDateKey(weekStart)
  const weekEndKey = isoDateKey(weekEndDisplay)
  const prevWeekStartKey = isoDateKey(prevWeekStart)
  const prevWeekEndKey = isoDateKey(prevWeekEnd)

  const lookAhead: WeeklyDigestLookAhead = planSessionsNextWeek.length
    ? {
        kind: 'plan',
        sessions: [...planSessionsNextWeek]
          .sort((a, b) => a.planned_date.localeCompare(b.planned_date))
          .map(p => ({
            sport: p.sport_type,
            label: p.sport_type ? sportLabel(p.sport_type) : 'vila',
            title: p.title,
            plannedDate: p.planned_date,
            isRest: p.is_rest,
          })),
      }
    : { kind: 'none' }

  return {
    weekStartISO: weekStartKey,
    weekEndISO: weekEndKey,
    thisWeek: {
      sessions: sessionStats(thisWeekActs),
      wellness: wellnessStats(wellnessHistory, weekStartKey, weekEndKey),
    },
    prevWeek: {
      sessions: sessionStats(prevWeekActs),
      wellness: wellnessStats(wellnessHistory, prevWeekStartKey, prevWeekEndKey),
    },
    adherence: matchAdherence(planSessionsThisWeek, thisWeekActs),
    lookAhead,
  }
}
