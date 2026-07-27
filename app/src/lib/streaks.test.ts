import { describe, it, expect } from 'vitest'
import { currentDailyStreak, currentWeeklyStreak, currentStepGoalStreak, daysMetStepGoalThisWeek, daysElapsedThisWeek } from './streaks'

// Fixed reference "now": Wednesday 2026-07-22, matches the week used
// throughout this session's plan-reconcile tests.
const now = new Date('2026-07-22T12:00:00Z')

function activity(dateISO: string) {
  return { start_date: `${dateISO}T08:00:00Z` }
}

describe('currentDailyStreak', () => {
  it('counts an active streak that includes today', () => {
    const activities = [activity('2026-07-22'), activity('2026-07-21'), activity('2026-07-20')]
    expect(currentDailyStreak(activities, now)).toBe(3)
  })

  it('stops counting at a gap in the middle of the history (broken streak)', () => {
    // 07-22 and 07-21 are consecutive, then a gap before 07-18 — only the
    // still-connected front portion counts.
    const activities = [activity('2026-07-22'), activity('2026-07-21'), activity('2026-07-18')]
    expect(currentDailyStreak(activities, now)).toBe(2)
  })

  it('grace period: still counts as alive when the most recent activity was yesterday, not today', () => {
    const activities = [activity('2026-07-21'), activity('2026-07-20')]
    expect(currentDailyStreak(activities, now)).toBe(2)
  })

  it('resets to 0 once two or more days have passed with no activity', () => {
    const activities = [activity('2026-07-19'), activity('2026-07-18')]
    expect(currentDailyStreak(activities, now)).toBe(0)
  })

  it('returns 0 for no activity at all', () => {
    expect(currentDailyStreak([], now)).toBe(0)
  })
})

describe('currentWeeklyStreak', () => {
  // Current week (Mon-start) is 2026-07-20; previous weeks are 07-13, 07-06.
  it('counts an active streak across consecutive weeks including this week', () => {
    const activities = [activity('2026-07-21'), activity('2026-07-14'), activity('2026-07-07')]
    expect(currentWeeklyStreak(activities, now)).toBe(3)
  })

  it('stops counting at a skipped week in the middle of the history (broken streak)', () => {
    // This week has activity, then a fully-skipped week, then week of 07-06.
    const activities = [activity('2026-07-21'), activity('2026-07-07')]
    expect(currentWeeklyStreak(activities, now)).toBe(1)
  })

  it('grace period: current week with zero activity so far still keeps the streak alive', () => {
    // Nothing logged yet this week, but last week and the week before both have activity.
    const activities = [activity('2026-07-14'), activity('2026-07-07')]
    expect(currentWeeklyStreak(activities, now)).toBe(2)
  })

  it('resets to 0 once a full week has passed with the most recent activity two+ weeks back', () => {
    const activities = [activity('2026-07-07'), activity('2026-06-30')]
    expect(currentWeeklyStreak(activities, now)).toBe(0)
  })

  it('returns 0 for no activity at all', () => {
    expect(currentWeeklyStreak([], now)).toBe(0)
  })
})

describe('currentStepGoalStreak', () => {
  const GOAL = 8000
  // History is walked from index 0 forward assuming it's already ordered
  // most-recent-first (matches how it's queried in the app).

  it('counts an active streak of days meeting the goal, ending today', () => {
    const history = [
      { date: '2026-07-22', steps: 9000 },
      { date: '2026-07-21', steps: 8500 },
      { date: '2026-07-20', steps: 8100 },
    ]
    expect(currentStepGoalStreak(history, GOAL, now)).toBe(3)
  })

  it('stops counting at the first day that missed the goal (broken streak)', () => {
    const history = [
      { date: '2026-07-22', steps: 9000 },
      { date: '2026-07-21', steps: 4000 }, // missed goal
      { date: '2026-07-20', steps: 8100 },
    ]
    expect(currentStepGoalStreak(history, GOAL, now)).toBe(1)
  })

  it('grace period: still counts as alive when the most recent wellness data is from yesterday', () => {
    const history = [
      { date: '2026-07-21', steps: 8200 },
      { date: '2026-07-20', steps: 8300 },
    ]
    expect(currentStepGoalStreak(history, GOAL, now)).toBe(2)
  })

  it('returns 0 when the most recent day is stale (2+ days with no data)', () => {
    const history = [{ date: '2026-07-19', steps: 9000 }]
    expect(currentStepGoalStreak(history, GOAL, now)).toBe(0)
  })

  it('returns 0 when the most recent day missed the goal', () => {
    const history = [{ date: '2026-07-22', steps: 3000 }]
    expect(currentStepGoalStreak(history, GOAL, now)).toBe(0)
  })

  it('returns 0 for no wellness history at all', () => {
    expect(currentStepGoalStreak([], GOAL, now)).toBe(0)
  })

  it('returns 0 when there is no goal set', () => {
    const history = [{ date: '2026-07-22', steps: 9000 }]
    expect(currentStepGoalStreak(history, 0, now)).toBe(0)
  })
})

describe('daysElapsedThisWeek', () => {
  it('counts days from Monday through today, inclusive', () => {
    expect(daysElapsedThisWeek(now)).toBe(3) // Mon 07-20, Tue 07-21, Wed 07-22
  })

  it('returns 1 on a Monday', () => {
    expect(daysElapsedThisWeek(new Date('2026-07-20T12:00:00Z'))).toBe(1)
  })

  it('returns 7 on a Sunday', () => {
    expect(daysElapsedThisWeek(new Date('2026-07-26T12:00:00Z'))).toBe(7)
  })
})

describe('daysMetStepGoalThisWeek', () => {
  const GOAL = 8000

  it('counts days this week that met the goal — a missed day does not zero out the rest', () => {
    // The exact complaint about the old streak-based Översikt card this
    // replaces: Monday missed the goal, but Tuesday/Wednesday still count
    // instead of the whole week reading as 0.
    const history = [
      { date: '2026-07-22', steps: 9000 }, // Wed, met
      { date: '2026-07-21', steps: 8500 }, // Tue, met
      { date: '2026-07-20', steps: 3000 }, // Mon, missed
    ]
    expect(daysMetStepGoalThisWeek(history, GOAL, now)).toBe(2)
  })

  it('ignores days from a previous week', () => {
    const history = [
      { date: '2026-07-22', steps: 9000 }, // this week (Wed)
      { date: '2026-07-19', steps: 9000 }, // last week (Sun)
    ]
    expect(daysMetStepGoalThisWeek(history, GOAL, now)).toBe(1)
  })

  it('ignores days with no step data', () => {
    const history = [
      { date: '2026-07-22', steps: null },
      { date: '2026-07-21', steps: 8500 },
    ]
    expect(daysMetStepGoalThisWeek(history, GOAL, now)).toBe(1)
  })

  it('returns 0 when there is no goal set', () => {
    const history = [{ date: '2026-07-22', steps: 9000 }]
    expect(daysMetStepGoalThisWeek(history, 0, now)).toBe(0)
  })

  it('returns 0 for no wellness history at all', () => {
    expect(daysMetStepGoalThisWeek([], GOAL, now)).toBe(0)
  })
})
