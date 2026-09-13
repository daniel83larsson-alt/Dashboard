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
  }, {
    serverInfo: { name: 'dl-trainer', version: '1.0.0' },
  })
}
