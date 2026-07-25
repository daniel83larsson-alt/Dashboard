import { describe, it, expect } from 'vitest'
import { planReconcileDecisions, type ReconcilableSession } from './plan-reconcile'
import type { ActivityRow } from './duplicates'

function session(overrides: Partial<ReconcilableSession> & { id: string; planned_date: string }): ReconcilableSession {
  return {
    is_rest: false,
    sport_type: 'Run',
    title: 'Löppass',
    ...overrides,
  }
}

function activity(overrides: Partial<ActivityRow> & { id: string; start_date: string }): ActivityRow {
  return {
    strava_id: 1,
    distance: 5000,
    moving_time: 1500,
    sport_type: 'Run',
    ...overrides,
  }
}

describe('planReconcileDecisions', () => {
  const now = new Date('2026-07-22T12:00:00Z') // Wednesday of the current week (2026-07-20 Monday)

  it('marks a matched session in the current week as done, not missed', () => {
    const planned = [session({ id: 's1', planned_date: '2026-07-21' })]
    const activities = [activity({ id: 'a1', start_date: '2026-07-21T08:00:00Z' })]
    const decisions = planReconcileDecisions(planned, activities, now)
    expect(decisions).toEqual([{ session: planned[0], action: 'done', activityId: 'a1' }])
  })

  it('leaves an unmatched session in the CURRENT week untouched (still time left)', () => {
    const planned = [session({ id: 's1', planned_date: '2026-07-24' })] // Friday, still ahead
    const decisions = planReconcileDecisions(planned, [], now)
    expect(decisions).toEqual([{ session: planned[0], action: 'none' }])
  })

  it('marks an unmatched session in a PAST week as missed', () => {
    const planned = [session({ id: 's1', planned_date: '2026-07-14' })] // previous week
    const decisions = planReconcileDecisions(planned, [], now)
    expect(decisions).toEqual([{ session: planned[0], action: 'missed' }])
  })

  it('matches a past-week session that moved to a different day within that week', () => {
    const planned = [session({ id: 's1', planned_date: '2026-07-13' })] // Monday last week
    const activities = [activity({ id: 'a1', start_date: '2026-07-16T08:00:00Z' })] // Thursday last week
    const decisions = planReconcileDecisions(planned, activities, now)
    expect(decisions).toEqual([{ session: planned[0], action: 'done', activityId: 'a1' }])
  })

  it('never matches across a week boundary', () => {
    const planned = [session({ id: 's1', planned_date: '2026-07-14' })] // last week
    const activities = [activity({ id: 'a1', start_date: '2026-07-21T08:00:00Z' })] // this week
    const decisions = planReconcileDecisions(planned, activities, now)
    expect(decisions).toEqual([{ session: planned[0], action: 'missed' }])
  })

  it('ignores rest days entirely', () => {
    const planned = [session({ id: 's1', planned_date: '2026-07-14', is_rest: true, sport_type: null })]
    const decisions = planReconcileDecisions(planned, [], now)
    expect(decisions).toEqual([])
  })
})
