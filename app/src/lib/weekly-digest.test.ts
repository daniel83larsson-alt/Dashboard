import { describe, it, expect } from 'vitest'
import { computeWeeklyDigest, matchAdherence, recapWeekStart, type PlanSessionRow } from './weekly-digest'
import type { ActivityRow } from './duplicates'
import type { DayWellness } from './garmin-sync'

// 2026-07-13 is a Monday (same reference week used elsewhere this session).
const WEEK_START = new Date('2026-07-13')

function activity(overrides: Partial<ActivityRow> & { id: string }): ActivityRow {
  return {
    strava_id: 1,
    start_date: '2026-07-13T08:00:00Z',
    distance: 5000,
    moving_time: 1200,
    sport_type: 'Rowing',
    ...overrides,
  }
}

function wellnessDay(date: string, overrides: Partial<DayWellness> = {}): DayWellness {
  return {
    date,
    restingHR: 50,
    sleepHours: 7,
    deepSleepHours: 1,
    remSleepHours: 1.5,
    lightSleepHours: 4.5,
    steps: 8000,
    bodyBattery: 70,
    hrv: 45,
    hrvStatus: 'BALANCED',
    totalCalories: null,
    activeCalories: null,
    ...overrides,
  }
}

function plan(overrides: Partial<PlanSessionRow>): PlanSessionRow {
  return { planned_date: '2026-07-13', is_rest: false, sport_type: 'Rowing', title: 'Rodd L2', ...overrides }
}

describe('recapWeekStart', () => {
  // Compared via toDateString() (local calendar day), not
  // toISOString().slice(0,10) (UTC) — recapWeekStart is built on
  // startOfWeek(), which returns LOCAL midnight, so a UTC-string comparison
  // only happens to match under TZ=UTC and produces an off-by-one day
  // under e.g. TZ=Europe/Stockholm (caught by CI's second vitest run).
  it('returns last week\'s Monday on a mid-week day', () => {
    // 2026-07-15 is a Wednesday in the week of 2026-07-13.
    const result = recapWeekStart(new Date('2026-07-15T12:00:00'))
    expect(result.toDateString()).toBe(new Date('2026-07-06').toDateString())
  })

  it('returns THIS week\'s Monday when run on a Sunday', () => {
    // 2026-07-19 is the Sunday of the week of 2026-07-13 — the digest sent
    // that evening should cover the week that's ending today, not last week.
    const result = recapWeekStart(new Date('2026-07-19T18:00:00'))
    expect(result.toDateString()).toBe(new Date('2026-07-13').toDateString())
  })

  it('returns last week\'s Monday on a Monday (the new week has just started)', () => {
    const result = recapWeekStart(new Date('2026-07-20T09:00:00'))
    expect(result.toDateString()).toBe(new Date('2026-07-13').toDateString())
  })
})

describe('matchAdherence', () => {
  it('returns null when the plan has no non-rest sessions', () => {
    expect(matchAdherence([plan({ is_rest: true, sport_type: null })], [])).toBeNull()
  })

  it('matches planned sessions to activities of the same sport, ignoring which day they moved to', () => {
    const planned = [
      plan({ planned_date: '2026-07-13', sport_type: 'Rowing' }),
      plan({ planned_date: '2026-07-15', sport_type: 'WeightTraining' }),
      plan({ planned_date: '2026-07-17', sport_type: 'Run' }),
    ]
    // The rowing session got moved to Sunday in the app — still counts.
    const activities = [
      activity({ id: 'a', sport_type: 'Rowing', start_date: '2026-07-19T08:00:00Z' }),
      activity({ id: 'b', sport_type: 'WeightTraining', start_date: '2026-07-15T08:00:00Z' }),
    ]
    const result = matchAdherence(planned, activities)
    expect(result).toEqual({ plannedCount: 3, doneCount: 2, label: '2 av 3 planerade pass gjorda' })
  })

  it('does not double-count one activity against two planned sessions of the same sport', () => {
    const planned = [
      plan({ planned_date: '2026-07-13', sport_type: 'Run' }),
      plan({ planned_date: '2026-07-15', sport_type: 'Run' }),
    ]
    const activities = [activity({ id: 'a', sport_type: 'Run' })]
    const result = matchAdherence(planned, activities)
    expect(result).toEqual({ plannedCount: 2, doneCount: 1, label: '1 av 2 planerade pass gjorda' })
  })
})

describe('computeWeeklyDigest', () => {
  it('splits sessions and wellness into this-week vs prev-week correctly', () => {
    const activities = [
      activity({ id: 'this-1', start_date: '2026-07-13T08:00:00Z', distance: 5000, moving_time: 1200, sport_type: 'Rowing' }),
      activity({ id: 'this-2', start_date: '2026-07-16T08:00:00Z', distance: 8000, moving_time: 2400, sport_type: 'Run' }),
      activity({ id: 'prev-1', start_date: '2026-07-06T08:00:00Z', distance: 4000, moving_time: 1000, sport_type: 'Rowing' }),
      activity({ id: 'too-old', start_date: '2026-06-01T08:00:00Z', distance: 4000, moving_time: 1000, sport_type: 'Rowing' }),
    ]
    const wellnessHistory = [
      wellnessDay('2026-07-13', { steps: 10000 }),
      wellnessDay('2026-07-14', { steps: 6000 }),
      wellnessDay('2026-07-06', { steps: 4000 }),
    ]

    const result = computeWeeklyDigest({
      weekStart: WEEK_START,
      activities,
      wellnessHistory,
      planSessionsThisWeek: [],
      planSessionsNextWeek: [],
    })

    expect(result.weekStartISO).toBe('2026-07-13')
    expect(result.weekEndISO).toBe('2026-07-19')
    expect(result.thisWeek.sessions.count).toBe(2)
    expect(result.thisWeek.sessions.totalKm).toBe(13)
    expect(result.prevWeek.sessions.count).toBe(1)
    expect(result.thisWeek.wellness.avgSteps).toBe(8000)
    expect(result.prevWeek.wellness.avgSteps).toBe(4000)
  })

  it('includes a session late on Sunday evening in this-week, not next week', () => {
    // Regression: the week-end boundary was originally Sunday 00:00, which
    // silently dropped any activity logged later that same Sunday — caught
    // by spot-checking against a real week of Daniel's own data.
    const activities = [activity({ id: 'sunday-night', start_date: '2026-07-19T22:00:00Z' })]
    const result = computeWeeklyDigest({
      weekStart: WEEK_START,
      activities,
      wellnessHistory: [],
      planSessionsThisWeek: [],
      planSessionsNextWeek: [],
    })
    expect(result.thisWeek.sessions.count).toBe(1)
  })

  it('groups this-week sessions by sport, most frequent first', () => {
    const activities = [
      activity({ id: '1', start_date: '2026-07-13T08:00:00Z', sport_type: 'Rowing' }),
      activity({ id: '2', start_date: '2026-07-14T08:00:00Z', sport_type: 'Rowing' }),
      activity({ id: '3', start_date: '2026-07-15T08:00:00Z', sport_type: 'Run' }),
    ]
    const result = computeWeeklyDigest({
      weekStart: WEEK_START,
      activities,
      wellnessHistory: [],
      planSessionsThisWeek: [],
      planSessionsNextWeek: [],
    })
    expect(result.thisWeek.sessions.bySport).toEqual([
      { sport: 'Rowing', label: 'rodd', count: 2 },
      { sport: 'Run', label: 'löpning', count: 1 },
    ])
  })

  it('returns adherence computed only from this-week activities', () => {
    const activities = [
      activity({ id: 'this', start_date: '2026-07-14T08:00:00Z', sport_type: 'Rowing' }),
      activity({ id: 'prev', start_date: '2026-07-07T08:00:00Z', sport_type: 'WeightTraining' }),
    ]
    const planSessionsThisWeek = [
      plan({ planned_date: '2026-07-13', sport_type: 'Rowing' }),
      plan({ planned_date: '2026-07-15', sport_type: 'WeightTraining' }),
    ]
    const result = computeWeeklyDigest({
      weekStart: WEEK_START,
      activities,
      wellnessHistory: [],
      planSessionsThisWeek,
      planSessionsNextWeek: [],
    })
    // WeightTraining was only done the PREVIOUS week, so it must not count.
    expect(result.adherence).toEqual({ plannedCount: 2, doneCount: 1, label: '1 av 2 planerade pass gjorda' })
  })

  it('returns lookAhead kind "none" when next week has no generated plan', () => {
    const result = computeWeeklyDigest({
      weekStart: WEEK_START,
      activities: [],
      wellnessHistory: [],
      planSessionsThisWeek: [],
      planSessionsNextWeek: [],
    })
    expect(result.lookAhead).toEqual({ kind: 'none' })
  })

  it('returns a sorted lookAhead plan when next week is already generated', () => {
    const planSessionsNextWeek = [
      plan({ planned_date: '2026-07-22', sport_type: 'Run', title: 'Löpning L2' }),
      plan({ planned_date: '2026-07-20', sport_type: 'Rowing', title: 'Rodd intervaller' }),
      plan({ planned_date: '2026-07-21', is_rest: true, sport_type: null, title: 'Vila' }),
    ]
    const result = computeWeeklyDigest({
      weekStart: WEEK_START,
      activities: [],
      wellnessHistory: [],
      planSessionsThisWeek: [],
      planSessionsNextWeek,
    })
    expect(result.lookAhead).toEqual({
      kind: 'plan',
      sessions: [
        { sport: 'Rowing', label: 'rodd', title: 'Rodd intervaller', plannedDate: '2026-07-20', isRest: false },
        { sport: null, label: 'vila', title: 'Vila', plannedDate: '2026-07-21', isRest: true },
        { sport: 'Run', label: 'löpning', title: 'Löpning L2', plannedDate: '2026-07-22', isRest: false },
      ],
    })
  })

  it('filters out sub-minute sync fragments from session counts, matching dedupeForStats elsewhere', () => {
    const activities = [
      activity({ id: 'real', start_date: '2026-07-13T08:00:00Z', moving_time: 1200 }),
      activity({ id: 'fragment', start_date: '2026-07-13T09:00:00Z', moving_time: 30 }),
    ]
    const result = computeWeeklyDigest({
      weekStart: WEEK_START,
      activities,
      wellnessHistory: [],
      planSessionsThisWeek: [],
      planSessionsNextWeek: [],
    })
    expect(result.thisWeek.sessions.count).toBe(1)
  })

  it('picks the highest-load session of the week as bestSession, not just the longest', () => {
    const activities = [
      // Same duration as the hard one, but no HR data — falls back to the
      // flat NO_HR_INTENSITY (0.5) load, which this session's real %HRR beats.
      activity({ id: 'easy', start_date: '2026-07-14T08:00:00Z', moving_time: 1200, average_heartrate: null }),
      activity({ id: 'hard', start_date: '2026-07-15T08:00:00Z', moving_time: 1200, average_heartrate: 180 }),
    ]
    const result = computeWeeklyDigest({
      weekStart: WEEK_START,
      activities,
      wellnessHistory: [],
      planSessionsThisWeek: [],
      planSessionsNextWeek: [],
      restingHR: 50,
      maxHR: 190,
    })
    expect(result.bestSession?.activityId).toBe('hard')
  })

  it('flags a new record only when it actually beats prior history, and compares against activities before it in time', () => {
    const activities = [
      // Older PR-eligible baseline, well before this week.
      activity({ id: 'baseline', start_date: '2026-06-01T08:00:00Z', distance: 5000, moving_time: 1500, sport_type: 'Run' }),
      // This week's run beats the baseline 5k time — should be flagged.
      activity({ id: 'this-week-pr', start_date: '2026-07-14T08:00:00Z', distance: 5000, moving_time: 1300, sport_type: 'Run' }),
      // A second, even faster run later the same week — should NOT make the
      // first one's PR-check see it, since it hadn't happened yet.
      activity({ id: 'this-week-faster', start_date: '2026-07-16T08:00:00Z', distance: 5000, moving_time: 1100, sport_type: 'Run' }),
    ]
    const result = computeWeeklyDigest({
      weekStart: WEEK_START,
      activities,
      wellnessHistory: [],
      planSessionsThisWeek: [],
      planSessionsNextWeek: [],
    })
    const ids = result.newRecords.map(r => r.activityId)
    expect(ids).toContain('this-week-pr')
    expect(ids).toContain('this-week-faster')
    const prEntry = result.newRecords.find(r => r.activityId === 'this-week-pr')
    expect(prEntry?.records).toContain('Snabbaste 5 km')
  })

  it('reports no bestSession and no newRecords when nothing was logged this week', () => {
    const result = computeWeeklyDigest({
      weekStart: WEEK_START,
      activities: [],
      wellnessHistory: [],
      planSessionsThisWeek: [],
      planSessionsNextWeek: [],
    })
    expect(result.bestSession).toBeNull()
    expect(result.newRecords).toEqual([])
  })
})
