import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { sendPushToUser } from '@/lib/push'
import { stockholmDateKey } from '@/lib/dates'
import { selectCheckinPeriod } from '@/lib/deficit'

// Runs once a day (see dl-trainer-cron.yml) — three independent, cheap
// checks per opted-in user: is today their weigh-in day and they haven't
// weighed in for 6 days, is it their monthly waist-measurement day, and is
// a check-in available and overdue (28+ days since the last one). No AI,
// no quota spend — same reasoning meal-reminders already established.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const todayKey = stockholmDateKey()
  const todayDow = new Date(`${todayKey}T00:00:00`).getDay()
  const dayOfMonth = new Date(`${todayKey}T00:00:00`).getDate()

  const { data: candidates } = await supabase
    .from('profiles')
    .select('id, deficit_weigh_in_weekday')
    .eq('deficit_tracking_enabled', true)
    .eq('deficit_reminders_enabled', true)
    .eq('deficit_weigh_in_weekday', todayDow)

  const userIds = (candidates ?? []).map(c => c.id)
  if (userIds.length === 0) {
    return NextResponse.json({ ranAt: new Date().toISOString(), candidates: 0, weighInReminded: 0, waistReminded: 0, checkinReminded: 0 })
  }

  const sixDaysAgo = new Date(new Date(`${todayKey}T00:00:00`).getTime() - 6 * 86400000).toISOString().slice(0, 10)
  const twentyFiveDaysAgo = new Date(new Date(`${todayKey}T00:00:00`).getTime() - 25 * 86400000).toISOString().slice(0, 10)
  const twentyEightDaysAgo = new Date(new Date(`${todayKey}T00:00:00`).getTime() - 28 * 86400000).toISOString().slice(0, 10)

  const [{ data: recentWeights }, { data: recentWaists }, { data: allWeights }, { data: recentCheckins }] = await Promise.all([
    supabase.from('body_measurements').select('user_id').in('user_id', userIds).not('weight_kg', 'is', null).gte('measured_on', sixDaysAgo),
    supabase.from('body_measurements').select('user_id').in('user_id', userIds).not('waist_cm', 'is', null).gte('measured_on', twentyFiveDaysAgo),
    supabase.from('body_measurements').select('user_id, measured_on, weight_kg').in('user_id', userIds).not('weight_kg', 'is', null).order('measured_on', { ascending: true }),
    supabase.from('deficit_checkins').select('user_id').in('user_id', userIds).gte('created_at', `${twentyEightDaysAgo}T00:00:00Z`),
  ])

  const hasRecentWeight = new Set((recentWeights ?? []).map(r => r.user_id))
  const hasRecentWaist = new Set((recentWaists ?? []).map(r => r.user_id))
  const hasRecentCheckin = new Set((recentCheckins ?? []).map(r => r.user_id))

  const weightsByUser = new Map<string, { date: string; weightKg: number }[]>()
  for (const row of (allWeights ?? [])) {
    const list = weightsByUser.get(row.user_id) ?? []
    list.push({ date: row.measured_on as string, weightKg: row.weight_kg as number })
    weightsByUser.set(row.user_id, list)
  }

  const weighInTargets = userIds.filter(id => !hasRecentWeight.has(id))
  const waistTargets = dayOfMonth <= 7 ? userIds.filter(id => !hasRecentWaist.has(id)) : []
  const checkinTargets = userIds.filter(id => {
    if (hasRecentCheckin.has(id)) return false
    const period = selectCheckinPeriod(weightsByUser.get(id) ?? [])
    return period != null
  })

  const [weighInResults, waistResults, checkinResults] = await Promise.all([
    Promise.allSettled(weighInTargets.map(userId => sendPushToUser(supabase, userId, {
      title: 'Dags att väga dig',
      body: 'Väg dig samma tid som vanligt för den mest tillförlitliga kurvan.',
      url: '/dashboard/viktmal',
    }))),
    Promise.allSettled(waistTargets.map(userId => sendPushToUser(supabase, userId, {
      title: 'Dags för midjemått',
      body: 'Månadens midjemätning — mer stabilt än vågen på kort sikt.',
      url: '/dashboard/viktmal',
    }))),
    Promise.allSettled(checkinTargets.map(userId => sendPushToUser(supabase, userId, {
      title: 'Din avstämning är redo',
      body: 'Jämför loggen mot faktisk viktförändring och kalibrera din budget.',
      url: '/dashboard/viktmal',
    }))),
  ])

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    candidates: userIds.length,
    weighInReminded: weighInResults.filter(r => r.status === 'fulfilled').length,
    waistReminded: waistResults.filter(r => r.status === 'fulfilled').length,
    checkinReminded: checkinResults.filter(r => r.status === 'fulfilled').length,
  })
}
