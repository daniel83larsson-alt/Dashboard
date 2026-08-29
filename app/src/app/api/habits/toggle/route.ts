import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { sendPushToUser } from '@/lib/push'
import { stockholmDateKey } from '@/lib/dates'
import { isDoneInCurrentPeriod, currentHabitStreak, type Habit, type HabitLog } from '@/lib/habits'
import { recordNewMilestones } from '@/lib/milestones'

// Moved off the client (HabitsCard used to insert/delete habit_logs
// directly via the browser Supabase client) so a milestone crossed by
// checking off a habit can trigger an immediate push — same "don't wait
// for the evening cron" reasoning as the log-manual/sync-all hooks.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { habitId } = await request.json() as { habitId: string }
  if (!habitId) return NextResponse.json({ error: 'habitId krävs' }, { status: 400 })

  const { data: habit } = await supabase
    .from('habits')
    .select('id, title, interval_days, created_at, active')
    .eq('id', habitId).eq('user_id', user.id).single()
  if (!habit) return NextResponse.json({ error: 'Vanan hittades inte' }, { status: 404 })

  const { data: logs } = await supabase
    .from('habit_logs')
    .select('habit_id, done_date')
    .eq('habit_id', habitId)
  const habitLogs = (logs ?? []) as HabitLog[]

  const wasDone = isDoneInCurrentPeriod(habit as Habit, habitLogs)
  const todayKey = stockholmDateKey()

  if (wasDone) {
    const existing = habitLogs.find(l => isDoneInCurrentPeriod(habit as Habit, [l]))
    if (existing) {
      await supabase.from('habit_logs').delete().eq('habit_id', habitId).eq('done_date', existing.done_date)
    }
    return NextResponse.json({ done: false })
  }

  await supabase.from('habit_logs').insert({ habit_id: habitId, user_id: user.id, done_date: todayKey })

  const newStreak = currentHabitStreak(habit as Habit, [...habitLogs, { habit_id: habitId, done_date: todayKey }])
  const newMilestones = await recordNewMilestones(supabase, user.id, [
    { kind: 'habit_streak', streakKey: habit.id, value: newStreak, label: habit.title },
  ])
  if (newMilestones.length) {
    await sendPushToUser(supabase, user.id, {
      title: 'Ny milstolpe! 🎉',
      body: newMilestones[0].message.replace('🎉 ', ''),
      url: '/dashboard',
    })
  }

  return NextResponse.json({ done: true, streak: newStreak })
}
