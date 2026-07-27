// Pure computation for "Veckans Recap" — the holistic weekly digest (no AI,
// no I/O). Given a week's deduped activities, wellness history, and that
// week's/next week's plan_sessions, produces the numbers the digest is
// built from. Callers (the in-app card and the Sunday email job) both
// generate an AI narrative FROM this output — this file never talks to
// Gemini and never writes anything back to the database.
import { dedupeForStats, type ActivityRow } from './duplicates'
import { sportLabel } from './sport'
import { startOfWeek } from './dates'
import type { DayWellness } from './garmin-sync'

// The Monday of "the week to recap" as of `now`. On any day Mon–Sat that's
// last week (the current week isn't over yet); on a Sunday it's THIS week's
// Monday, since Sunday evening is when the digest is meant to cover the
// week that's ending today (the approved send time) — matching Daniel's own
// framing ("din förra vecka" sent Sunday evening means the week just lived,
// including today). Both the manual "generate now" trigger and the Sunday
// cron call this so they never disagree on which week "last week" means.
export function recapWeekStart(now: Date = new Date()): Date {
  const thisWeekMonday = startOfWeek(now)
  if (now.getDay() === 0) return thisWeekMonday
  const lastWeekMonday = new Date(thisWeekMonday)
  lastWeekMonday.setDate(lastWeekMonday.getDate() - 7)
  return lastWeekMonday
}

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

// Deduped activities within [weekStart, weekStart+7) — exported so callers
// that need the actual per-session list (not just aggregated stats, e.g. the
// AI prompt builder) reuse the exact same dedup+boundary logic as the stats
// below, rather than re-deriving it and risking the two disagreeing (see the
// Sunday-evening boundary bug this function's tests already cover).
export function activitiesInWeek(activities: ActivityRow[], weekStart: Date): ActivityRow[] {
  const weekEndExclusive = new Date(weekStart)
  weekEndExclusive.setDate(weekEndExclusive.getDate() + 7)
  return dedupeForStats(activities).filter(a => new Date(a.start_date) >= weekStart && new Date(a.start_date) < weekEndExclusive)
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

// Greedy, week-level, sport-only match — deliberately loose (no day-of-week
// tolerance check, no distance/time comparison): a planned session counts
// as done if there's any unclaimed activity of the same sport_type anywhere
// in the same week, which already covers "moved the session to a different
// day" for free. Generic over the session type so both this digest's
// read-only adherence count AND plan-reconcile.ts's real write-back
// (matched_activity_id, status) share the exact same matching rule instead
// of two copies quietly drifting apart.
type Matchable = { is_rest: boolean; sport_type: string | null }
export function greedySportMatch<P extends Matchable, A extends ActivityRow>(
  planned: P[], activities: A[]
): { session: P; activity: A | null }[] {
  const nonRest = planned.filter(p => !p.is_rest && p.sport_type)
  const unclaimed = [...activities]
  return nonRest.map(p => {
    const idx = unclaimed.findIndex(a => a.sport_type === p.sport_type)
    if (idx === -1) return { session: p, activity: null }
    const [activity] = unclaimed.splice(idx, 1)
    return { session: p, activity }
  })
}

// Purely computed for this digest — never persisted back to plan_sessions
// (see plan-reconcile.ts for the job that actually writes matches back).
export function matchAdherence(planned: PlanSessionRow[], activities: ActivityRow[]): WeeklyDigestAdherence {
  const pairs = greedySportMatch(planned, activities)
  if (!pairs.length) return null
  const done = pairs.filter(p => p.activity).length
  return { plannedCount: pairs.length, doneCount: done, label: `${done} av ${pairs.length} planerade pass gjorda` }
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

  const thisWeekActs = activitiesInWeek(activities, weekStart)
  const prevWeekActs = activitiesInWeek(activities, prevWeekStart)

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
