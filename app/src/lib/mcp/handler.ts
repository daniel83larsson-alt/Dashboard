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
import { computeTrainingAdherence } from './training-adherence'
import { computeRecentWorkouts } from './recent-workouts'
import { computeRowingTrends } from './rowing-trends'
import { computeRecoveryData } from './recovery-data'
import { computeLatestMeasurements } from './latest-measurements'
import { computeGoalProgress } from './goal-progress'

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
        const data = await fetchMcpUserData(supabase, auth.userId, todayKey, windowStart)
        const payload = computeWeeklySummary(data, todayKey)
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
  }, {
    serverInfo: { name: 'dl-trainer', version: '1.0.0' },
  })
}
