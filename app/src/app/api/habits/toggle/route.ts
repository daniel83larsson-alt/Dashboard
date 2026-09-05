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
const BACKDATE_DAYS = 7

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { habitId: string; date?: string }
  const { habitId } = body
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

  const todayKey = stockholmDateKey()

  // Två lägen: ingen `date` = huvudkryssrutan, oförändrat beteende (hela
  // den AKTUELLA perioden, så en veckovana bara behöver en dag ikryssad).
  // En `date` = raden med de senaste dagarna (Daniel: "glömde kryssa i
  // kreatin igår") — kryssar exakt DET datumet, oavsett period, så en
  // veckovana visar exakt vilken dag den loggades istället för att bara
  // radera vilken dag som helst i veckan.
  let targetDateKey = todayKey
  let removingDateKey: string | null = null

  if (body.date) {
    const dateKey = body.date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return NextResponse.json({ error: 'Ogiltigt datum' }, { status: 400 })
    const earliestAllowed = new Date(new Date(`${todayKey}T00:00:00`).getTime() - (BACKDATE_DAYS - 1) * 86400000).toISOString().slice(0, 10)
    if (dateKey > todayKey || dateKey < earliestAllowed) {
      return NextResponse.json({ error: `Kan bara ändra de senaste ${BACKDATE_DAYS} dagarna` }, { status: 400 })
    }
    targetDateKey = dateKey
    if (habitLogs.some(l => l.done_date === dateKey)) removingDateKey = dateKey
  } else if (isDoneInCurrentPeriod(habit as Habit, habitLogs)) {
    const existing = habitLogs.find(l => isDoneInCurrentPeriod(habit as Habit, [l]))
    removingDateKey = existing?.done_date ?? todayKey
  }

  if (removingDateKey) {
    await supabase.from('habit_logs').delete().eq('habit_id', habitId).eq('done_date', removingDateKey)
    return NextResponse.json({ done: false, date: removingDateKey })
  }

  await supabase.from('habit_logs').insert({ habit_id: habitId, user_id: user.id, done_date: targetDateKey })

  const newStreak = currentHabitStreak(habit as Habit, [...habitLogs, { habit_id: habitId, done_date: targetDateKey }])
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

  return NextResponse.json({ done: true, date: targetDateKey, streak: newStreak })
}
