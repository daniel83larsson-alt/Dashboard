import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { sendPushToUser } from '@/lib/push'
import { currentDailyStreak } from '@/lib/streaks'

export const maxDuration = 60

type Activity = { user_id: string; start_date: string }

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

  const now = new Date()
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

  return NextResponse.json({ ranAt: now.toISOString(), checked: byUser.size, notified: notified.length })
}
