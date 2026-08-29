import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { sendPushToUser } from '@/lib/push'
import { stockholmDateKey } from '@/lib/dates'
import { KOST_MEALS, kostMealLabel, type KostMeal } from '@/lib/kost'

// One cron route, called four times a day (see dl-trainer-cron.yml) with a
// different ?meal= each time — breakfast/lunch/dinner/supper each have
// their own fixed reminder time (lib/kost.ts's MEAL_REMINDER_HOUR); snack
// is deliberately never reminded since it has no fixed slot by design (can
// happen any number of times a day). Only reaches users who opted in
// (kost_tracking_enabled + kost_reminders_enabled) AND actually track that
// specific meal — someone who only tracks breakfast+lunch never hears
// about dinner. YAZIO-connected users are untouched: this only fires for
// people logging manually (see STATUS.md for why).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const meal = request.nextUrl.searchParams.get('meal') as KostMeal | null
  if (!meal || !KOST_MEALS.includes(meal)) {
    return NextResponse.json({ error: 'Missing or invalid ?meal=' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()
  const todayKey = stockholmDateKey()

  const { data: candidates } = await supabase
    .from('profiles')
    .select('id')
    .eq('kost_tracking_enabled', true)
    .eq('kost_reminders_enabled', true)
    .contains('kost_tracked_meals', [meal])

  const userIds = (candidates ?? []).map(c => c.id)
  if (userIds.length === 0) {
    return NextResponse.json({ ranAt: new Date().toISOString(), meal, candidates: 0, reminded: 0 })
  }

  // Anyone who already logged this meal today, in one query rather than
  // one per user — a day's worth of manual logging is a small table per
  // user, this stays cheap even as the user base grows. Fetches a wide
  // enough window (36h covers any UTC/Stockholm offset) and filters by
  // Stockholm calendar day in JS — a plain UTC-midnight cutoff would
  // misclassify entries logged in the first 1-2 hours after Stockholm
  // midnight (real bug caught before shipping, same class of mistake
  // stockholmDateKey exists to avoid elsewhere in the app).
  const windowStart = new Date(new Date().getTime() - 36 * 3600 * 1000)
  const { data: loggedRows } = await supabase
    .from('food_log')
    .select('user_id, logged_at')
    .in('user_id', userIds)
    .eq('meal', meal)
    .gte('logged_at', windowStart.toISOString())

  const alreadyLogged = new Set(
    (loggedRows ?? [])
      .filter(r => stockholmDateKey(new Date(r.logged_at)) === todayKey)
      .map(r => r.user_id)
  )
  const toRemind = userIds.filter(id => !alreadyLogged.has(id))

  const label = kostMealLabel(meal)
  const settled = await Promise.allSettled(
    toRemind.map(userId => sendPushToUser(supabase, userId, {
      title: `Glömde du logga ${label.toLowerCase()}?`,
      body: `Inget loggat som ${label.toLowerCase()} idag än.`,
      url: '/dashboard/mat',
    }))
  )
  const reminded = settled.filter(r => r.status === 'fulfilled').length

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    meal,
    candidates: userIds.length,
    alreadyLogged: alreadyLogged.size,
    reminded,
  })
}
