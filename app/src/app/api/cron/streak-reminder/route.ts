import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { sendPushToUser } from '@/lib/push'
import { currentDailyStreak } from '@/lib/streaks'
import { startOfWeek } from '@/lib/dates'
import type { SupabaseClient } from '@supabase/supabase-js'

export const maxDuration = 60

type Activity = { user_id: string; start_date: string }
type PendingPlanSession = { user_id: string; is_rest: boolean }

// Piggybacks on this same daily evening cron rather than its own entry —
// per Daniel: "påminna innan söndag att man har ett kvar" (a reminder that
// arrives on Sunday itself would already be too late, the week is basically
// over). Deliberately only counts sessions still 'planned' — the sync-all
// cron earlier the same day already flips matched ones to 'done' via
// plan-reconcile.ts, so this never nags about a session that's done already.
async function remindPendingPlanSessions(supabase: SupabaseClient, now: Date) {
  const weekStart = startOfWeek(now)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekStartKey = weekStart.toISOString().slice(0, 10)
  const weekEndKey = weekEnd.toISOString().slice(0, 10)

  const { data: sessions } = await supabase
    .from('plan_sessions')
    .select('user_id, is_rest')
    .eq('status', 'planned')
    .gte('planned_date', weekStartKey)
    .lte('planned_date', weekEndKey)

  const countByUser = new Map<string, number>()
  for (const s of (sessions ?? []) as PendingPlanSession[]) {
    if (s.is_rest) continue
    countByUser.set(s.user_id, (countByUser.get(s.user_id) ?? 0) + 1)
  }

  await Promise.allSettled(
    [...countByUser.entries()].map(([userId, count]) =>
      sendPushToUser(supabase, userId, {
        title: count === 1 ? 'Ett pass kvar i veckan' : `${count} pass kvar i veckan`,
        body: count === 1
          ? 'Du har ett planerat pass kvar innan veckan är slut imorgon.'
          : `Du har ${count} planerade pass kvar innan veckan är slut imorgon.`,
        url: '/dashboard/veckoplan',
      })
    )
  )

  return countByUser.size
}

// Runs once in the evening (see vercel.json) — only pings someone who
// actually has a streak worth protecting (2+ days) AND hasn't logged
// anything yet today, so this never nags a user with no streak or someone
// who already trained today.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const now = new Date()

  const isSaturday = now.getDay() === 6
  const planRemindersSent = isSaturday ? await remindPendingPlanSessions(supabase, now) : 0

  const since = new Date()
  since.setDate(since.getDate() - 30) // enough history for any realistic streak
  const { data: activities } = await supabase
    .from('activities')
    .select('user_id, start_date')
    .gte('start_date', since.toISOString())

  const byUser = new Map<string, Activity[]>()
  for (const a of (activities ?? []) as Activity[]) {
    const list = byUser.get(a.user_id) ?? []
    list.push(a)
    byUser.set(a.user_id, list)
  }

  const todayKey = now.toISOString().slice(0, 10)

  const notified: string[] = []
  for (const [userId, acts] of byUser) {
    const streak = currentDailyStreak(acts.map(a => ({ start_date: a.start_date })), now)
    if (streak < 2) continue
    const loggedToday = acts.some(a => a.start_date.slice(0, 10) === todayKey)
    if (loggedToday) continue
    notified.push(userId)
  }

  await Promise.allSettled(
    notified.map(userId =>
      sendPushToUser(supabase, userId, {
        title: 'Din streak är i fara',
        body: 'Logga ett pass innan dagen är slut så håller den ihop.',
        url: '/dashboard/logga',
      })
    )
  )

  return NextResponse.json({ ranAt: now.toISOString(), checked: byUser.size, notified: notified.length, planRemindersSent })
}
