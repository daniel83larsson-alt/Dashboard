// Builds the MCP server for one resolved auth context. Constructed fresh
// per HTTP request (see app/api/mcp/route.ts) rather than once at module
// scope — createMcpHandler's initializeServer callback takes no request
// parameter, so closing over the already-resolved userId here is the only
// way to get per-request identity into a tool's callback. This is cheap:
// registering two tools costs microseconds, and the whole protocol is
// stateless per request anyway (no session to reuse across calls).
import { z } from 'zod'
import { createMcpHandler } from 'mcp-handler'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { stockholmDateKey } from '@/lib/dates'
import { logApiCall } from '@/lib/log-api-call'
import { fetchMcpUserData } from './fetch-user-data'
import { computeWeeklySummary } from './weekly-summary'
import { computeProteinTrend } from './protein-trend'
import { dateKeysEndingToday } from './window'
import { fetchMcpActivities, fetchMcpStrengthGoal } from './fetch-training-data'
import { fetchMcpWellnessHistory } from './fetch-wellness-data'
import { fetchMcpActiveMilestone } from './fetch-milestone'
import { fetchMcpBudgetEvents } from './fetch-budget-events'
import { computeTrainingAdherence } from './training-adherence'
import { computeRecentWorkouts } from './recent-workouts'
import { computeRowingTrends } from './rowing-trends'
import { computeRecoveryData } from './recovery-data'
import { computeLatestMeasurements } from './latest-measurements'
import { computeGoalProgress } from './goal-progress'
import { computeDailyLog } from './daily-log'
import { computeCalorieBalance } from './calorie-balance'
import { fetchMcpBudgetHistory } from './fetch-budget-history'
import { computeBudgetHistory } from './budget-history'
import { computeTdeeTrend } from './tdee-trend'
import { computeRestingHrTrend } from './resting-hr-trend'
import { computePaceAtEffort } from './pace-at-effort'

// How far back activity history is fetched for the training tools — matches
// garmin-sync.ts's own ACTIVITY_HISTORY_MAX_DAYS retention cap, so "last
// strength session" can find anything the app itself still keeps around.
const ACTIVITY_FETCH_LOOKBACK_DAYS = 365

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

const NOT_AUTHENTICATED_TEXT = 'Not authenticated — the DL Trainer API key header is missing or invalid.'

function unauthenticatedResult() {
  return { content: [{ type: 'text' as const, text: NOT_AUTHENTICATED_TEXT }], isError: true }
}

export function buildMcpHandler(auth: { userId: string } | null) {
  return createMcpHandler(server => {
    server.registerTool(
      'get_weekly_summary',
      {
        title: 'Get weekly summary',
        description:
          'Rolling 7-day summary of calorie/protein adherence, weight, and waist for the DL Trainer weight-loss goal. ' +
          'kcal_diff_avg_7d and kcal_diff_target are daily energy balance vs TDEE (not vs budget) — negative means a calorie deficit.',
        inputSchema: z.object({}),
      },
      async () => {
        if (!auth) return unauthenticatedResult()
        const supabase = createSupabaseAdminClient()
        const todayKey = stockholmDateKey()
        const windowStart = dateKeysEndingToday(todayKey, 7)[0]
        const [data, budgetEvents] = await Promise.all([
          fetchMcpUserData(supabase, auth.userId, todayKey, windowStart),
          fetchMcpBudgetEvents(supabase, auth.userId),
        ])
        const payload = computeWeeklySummary(data, todayKey, budgetEvents)
        logApiCall(supabase, auth.userId, 'mcp/get_weekly_summary')
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
      }
    )

    server.registerTool(
      'get_protein_trend',
      {
        title: 'Get protein trend',
        description:
          'Average daily protein intake over a rolling window ending today, vs the user\'s protein target, ' +
          'plus the single lowest- and highest-protein days in that window.',
        inputSchema: z.object({
          days: z.number().int().min(1).max(90).optional().default(7),
        }),
      },
      async ({ days }) => {
        if (!auth) return unauthenticatedResult()
        const supabase = createSupabaseAdminClient()
        const todayKey = stockholmDateKey()
        const windowStart = dateKeysEndingToday(todayKey, days)[0]
        const data = await fetchMcpUserData(supabase, auth.userId, todayKey, windowStart)
        const payload = computeProteinTrend(data, todayKey, days)
        logApiCall(supabase, auth.userId, 'mcp/get_protein_trend')
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
      }
    )

    server.registerTool(
      'get_training_adherence',
      {
        title: 'Get training adherence',
        description:
          'How many strength/kettlebell and rowing sessions were logged in the last N weeks, vs a structured weekly ' +
          'strength target if one is set as an active goal (null if no such goal exists — never guessed).',
        inputSchema: z.object({
          weeks: z.number().int().min(1).max(26).optional().default(4),
        }),
      },
      async ({ weeks }) => {
        if (!auth) return unauthenticatedResult()
        const supabase = createSupabaseAdminClient()
        const todayKey = stockholmDateKey()
        const [activities, strengthGoal] = await Promise.all([
          fetchMcpActivities(supabase, auth.userId, isoDaysAgo(ACTIVITY_FETCH_LOOKBACK_DAYS)),
          fetchMcpStrengthGoal(supabase, auth.userId),
        ])
        const payload = computeTrainingAdherence(activities, strengthGoal, weeks, todayKey)
        logApiCall(supabase, auth.userId, 'mcp/get_training_adherence')
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
      }
    )

    server.registerTool(
      'get_recent_workouts',
      {
        title: 'Get recent workouts',
        description:
          'The most recent logged workouts (any sport), optionally filtered by type (matches either the raw sport ' +
          'type like "Rowing" or its Swedish label like "rodd"). For manually logged strength/kettlebell sessions, ' +
          '"name" carries the exercise summary text (e.g. "3x10 Svingar, 3x10 Goblet Squat") — there is no separate ' +
          'structured per-exercise weight_kg or notes field in this app.',
        inputSchema: z.object({
          limit: z.number().int().min(1).max(50).optional().default(10),
          type: z.string().optional(),
        }),
      },
      async ({ limit, type }) => {
        if (!auth) return unauthenticatedResult()
        const supabase = createSupabaseAdminClient()
        const activities = await fetchMcpActivities(supabase, auth.userId, isoDaysAgo(ACTIVITY_FETCH_LOOKBACK_DAYS))
        const payload = computeRecentWorkouts(activities, limit, type ?? null)
        logApiCall(supabase, auth.userId, 'mcp/get_recent_workouts')
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
      }
    )

    server.registerTool(
      'get_rowing_trends',
      {
        title: 'Get rowing trends',
        description:
          'Rowing volume and whole-session average pace (distance/time, not heart-rate-banded) over the last N ' +
          'weeks vs the equal-length period before it, plus average resting heart rate over the same period. ' +
          'Per-split heart-rate-banded pace and a "hard session" classification are not available — this app only ' +
          'caches rowing splits per-activity on demand, not in bulk across a whole period.',
        inputSchema: z.object({
          weeks: z.number().int().min(1).max(26).optional().default(8),
        }),
      },
      async ({ weeks }) => {
        if (!auth) return unauthenticatedResult()
        const supabase = createSupabaseAdminClient()
        const todayKey = stockholmDateKey()
        const [activities, wellnessHistory] = await Promise.all([
          fetchMcpActivities(supabase, auth.userId, isoDaysAgo(weeks * 7 * 2)),
          fetchMcpWellnessHistory(supabase, auth.userId),
        ])
        const payload = computeRowingTrends(activities, wellnessHistory, weeks, todayKey)
        logApiCall(supabase, auth.userId, 'mcp/get_rowing_trends')
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
      }
    )

    server.registerTool(
      'get_recovery_data',
      {
        title: 'Get recovery data',
        description:
          'Sleep, steps, resting heart rate, and Body Battery averaged over the last N days, synced from Garmin — ' +
          'the same combined data source the app\'s own rest-day signals use, not a live Garmin call.',
        inputSchema: z.object({
          days: z.number().int().min(1).max(90).optional().default(7),
        }),
      },
      async ({ days }) => {
        if (!auth) return unauthenticatedResult()
        const supabase = createSupabaseAdminClient()
        const todayKey = stockholmDateKey()
        const [wellnessHistory, profileRow] = await Promise.all([
          fetchMcpWellnessHistory(supabase, auth.userId),
          supabase.from('profiles').select('daily_step_goal').eq('id', auth.userId).single(),
        ])
        const stepsTarget = (profileRow.data?.daily_step_goal as number | undefined) ?? 10000
        const payload = computeRecoveryData(wellnessHistory, stepsTarget, days, todayKey)
        logApiCall(supabase, auth.userId, 'mcp/get_recovery_data')
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
      }
    )

    server.registerTool(
      'get_latest_measurements',
      {
        title: 'Get latest measurements',
        description: 'The most recent logged weight and waist measurement, each looked up independently since either can be missing on a given day.',
        inputSchema: z.object({}),
      },
      async () => {
        if (!auth) return unauthenticatedResult()
        const supabase = createSupabaseAdminClient()
        const todayKey = stockholmDateKey()
        const data = await fetchMcpUserData(supabase, auth.userId, todayKey, todayKey)
        const payload = computeLatestMeasurements(data.measurements, todayKey)
        logApiCall(supabase, auth.userId, 'mcp/get_latest_measurements')
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
      }
    )

    server.registerTool(
      'get_goal_progress',
      {
        title: 'Get goal progress',
        description:
          'Progress toward the main weight goal and any active sub-goal (delmål), including a projected date at the ' +
          'current pace and whether that lands on or before the target date. The pace is derived from a rolling ' +
          '7-day-vs-previous-7-day weight average, so it needs at least two weeks of logged weight to produce a ' +
          'projection — otherwise on_track and projected_date_at_current_pace are null, never guessed.',
        inputSchema: z.object({}),
      },
      async () => {
        if (!auth) return unauthenticatedResult()
        const supabase = createSupabaseAdminClient()
        const todayKey = stockholmDateKey()
        const [data, activeMilestone] = await Promise.all([
          fetchMcpUserData(supabase, auth.userId, todayKey, todayKey),
          fetchMcpActiveMilestone(supabase, auth.userId),
        ])
        const payload = computeGoalProgress(data.profile, data.measurements, activeMilestone, todayKey)
        logApiCall(supabase, auth.userId, 'mcp/get_goal_progress')
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
      }
    )

    server.registerTool(
      'get_daily_log',
      {
        title: 'Get daily log',
        description:
          'Every logged meal entry for one specific date — a food name for a manually logged entry, or a per-meal-' +
          'category total with no item name for a YAZIO-synced day (YAZIO never exposes individual food names) — ' +
          'plus that day\'s total kcal/protein vs budget/target and any context tag (e.g. sick, travel). Use this to ' +
          'check whether a SPECIFIC day was logged fully/correctly, unlike get_weekly_summary\'s rolling average.',
        inputSchema: z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
        }),
      },
      async ({ date }) => {
        if (!auth) return unauthenticatedResult()
        const supabase = createSupabaseAdminClient()
        const [data, noteRow] = await Promise.all([
          fetchMcpUserData(supabase, auth.userId, date, date),
          supabase.from('day_context_notes').select('tag').eq('user_id', auth.userId).eq('date', date).maybeSingle(),
        ])
        const contextTag = (noteRow.data?.tag as string | undefined) ?? null
        const payload = computeDailyLog(data, date, contextTag)
        logApiCall(supabase, auth.userId, 'mcp/get_daily_log')
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
      }
    )

    server.registerTool(
      'get_calorie_balance',
      {
        title: 'Get calorie balance',
        description:
          'Average calories eaten, TDEE, the training-burn component of TDEE, and budget as separate figures over ' +
          'the last N days — a complement to get_weekly_summary\'s single already-combined diff, for telling apart ' +
          '"ate too little" from "TDEE/training estimate is off".',
        inputSchema: z.object({
          days: z.number().int().min(1).max(90).optional().default(7),
        }),
      },
      async ({ days }) => {
        if (!auth) return unauthenticatedResult()
        const supabase = createSupabaseAdminClient()
        const todayKey = stockholmDateKey()
        const windowStart = dateKeysEndingToday(todayKey, days)[0]
        const [data, activities, budgetEvents, profileRow] = await Promise.all([
          fetchMcpUserData(supabase, auth.userId, todayKey, windowStart),
          // +1 day of margin — dateKeysEndingToday's window starts at exact
          // midnight of the earliest day, while isoDaysAgo(days) is "now
          // minus days days" (time-of-day-relative), which would otherwise
          // under-fetch that earliest day's activities depending on what
          // time of day this runs.
          fetchMcpActivities(supabase, auth.userId, isoDaysAgo(days + 1)),
          fetchMcpBudgetEvents(supabase, auth.userId),
          supabase.from('profiles').select('deficit_garmin_correction').eq('id', auth.userId).single(),
        ])
        const garminCorrection = (profileRow.data?.deficit_garmin_correction as number | undefined) ?? 0.75
        const payload = computeCalorieBalance(data, activities, budgetEvents, garminCorrection, todayKey, days)
        logApiCall(supabase, auth.userId, 'mcp/get_calorie_balance')
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
      }
    )

    server.registerTool(
      'get_budget_history',
      {
        title: 'Get budget history',
        description:
          'Every budget/TDEE change event in the last N days with a readable reason (what actually moved — training ' +
          'volume, resting metabolism, everyday-activity factor, or the Garmin correction), same as the ' +
          'Budgethistorik card on the Viktmål page. Excludes protein-goal changes — see get_protein_trend for protein.',
        inputSchema: z.object({
          days: z.number().int().min(1).max(365).optional().default(30),
        }),
      },
      async ({ days }) => {
        if (!auth) return unauthenticatedResult()
        const supabase = createSupabaseAdminClient()
        const todayKey = stockholmDateKey()
        const events = await fetchMcpBudgetHistory(supabase, auth.userId)
        const payload = computeBudgetHistory(events, days, todayKey)
        logApiCall(supabase, auth.userId, 'mcp/get_budget_history')
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
      }
    )

    server.registerTool(
      'get_tdee_trend',
      {
        title: 'Get TDEE trend',
        description:
          'The actual whole-TDEE value in force at the end of each of the last N weeks, reconstructed from budget ' +
          'history rather than assuming today\'s current TDEE applied retroactively — a curve separate from the ' +
          'weight curve, so a dropping TDEE (less training vs a lighter body) can be told apart.',
        inputSchema: z.object({
          weeks: z.number().int().min(1).max(52).optional().default(12),
        }),
      },
      async ({ weeks }) => {
        if (!auth) return unauthenticatedResult()
        const supabase = createSupabaseAdminClient()
        const todayKey = stockholmDateKey()
        const [data, budgetEvents] = await Promise.all([
          fetchMcpUserData(supabase, auth.userId, todayKey, todayKey),
          fetchMcpBudgetEvents(supabase, auth.userId),
        ])
        const payload = computeTdeeTrend(data.profile?.deficit_tdee_kcal ?? null, budgetEvents, todayKey, weeks)
        logApiCall(supabase, auth.userId, 'mcp/get_tdee_trend')
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
      }
    )

    server.registerTool(
      'get_resting_hr_trend',
      {
        title: 'Get resting heart rate trend',
        description:
          'Resting heart rate as a weekly time series over the last N weeks (one averaged point per week, oldest ' +
          'first), synced from Garmin — the same daily wellness history get_recovery_data/get_rowing_trends already ' +
          'read, just broken out per week instead of one flat period average. Answers "has my resting HR actually ' +
          'trended down over months", which a single period average hides.',
        inputSchema: z.object({
          weeks: z.number().int().min(1).max(52).optional().default(26),
        }),
      },
      async ({ weeks }) => {
        if (!auth) return unauthenticatedResult()
        const supabase = createSupabaseAdminClient()
        const todayKey = stockholmDateKey()
        const wellnessHistory = await fetchMcpWellnessHistory(supabase, auth.userId)
        const payload = computeRestingHrTrend(wellnessHistory, todayKey, weeks)
        logApiCall(supabase, auth.userId, 'mcp/get_resting_hr_trend')
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
      }
    )

    server.registerTool(
      'get_pace_at_effort',
      {
        title: 'Get pace/performance at a given heart-rate effort level',
        description:
          'Groups logged sessions of a given activity type (any type the app already tracks — e.g. "rodd"/"Rowing", ' +
          '"löpning"/"Run", "cykling"/"Ride", either the Swedish label or the internal name works) into 10bpm average-' +
          'heart-rate bands over the last N weeks, and reports the aggregated pace/speed within each band — this is ' +
          'how "did my pace at a similar effort level actually improve" gets answered instead of a whole-period ' +
          'average that mixes easy and hard sessions together. Optionally compares against an equal-length period ' +
          'starting compare_to_weeks_ago weeks ago (e.g. 26 for "vs six months ago"). ' +
          'Important limitation: banding is per WHOLE SESSION (a session\'s own average heart rate places it in a ' +
          'band), not per split/interval within a session — true per-split HR-banded pace only exists for Concept2-' +
          'sourced rowing sessions the user has already individually opened, and isn\'t cached in bulk across a ' +
          'period. Strength/kettlebell activity types are reported as unsupported (no effort/RPE field exists for ' +
          'them yet), never guessed at.',
        inputSchema: z.object({
          activity_type: z.string(),
          weeks: z.number().int().min(1).max(26).optional().default(8),
          compare_to_weeks_ago: z.number().int().min(1).max(104).optional(),
        }),
      },
      async ({ activity_type, weeks, compare_to_weeks_ago }) => {
        if (!auth) return unauthenticatedResult()
        const supabase = createSupabaseAdminClient()
        const todayKey = stockholmDateKey()
        const lookbackWeeks = compare_to_weeks_ago != null ? compare_to_weeks_ago + weeks : weeks
        const activities = await fetchMcpActivities(supabase, auth.userId, isoDaysAgo(lookbackWeeks * 7))
        const payload = computePaceAtEffort(activities, activity_type, weeks, todayKey, compare_to_weeks_ago ?? null)
        logApiCall(supabase, auth.userId, 'mcp/get_pace_at_effort')
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
      }
    )
  }, {
    serverInfo: { name: 'dl-trainer', version: '1.0.0' },
  })
}
