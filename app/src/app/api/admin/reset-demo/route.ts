import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

// (Re)seeds the shared public demo account ("Prova demo" on /login) with
// realistic-looking but entirely fake training/health data — never touches
// a real user. Safe to call repeatedly: wipes the demo account's own data
// first, so this doubles as the reset button for when browsing has left it
// messy. Admin-only, mirrors the other one-off admin maintenance routes.
function rand(min: number, max: number) { return min + Math.random() * (max - min) }
function randInt(min: number, max: number) { return Math.round(rand(min, max)) }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function daysAgo(n: number, hour = 7) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, randInt(0, 59), 0, 0)
  return d
}

type SportProfile = {
  sport: string
  weight: number
  namePool: string[]
  distRangeM: [number, number] | null
  paceMinPerKm: [number, number] | null
  durMinRange: [number, number] | null
  hr: [number, number]
}

const SPORT_PROFILES: SportProfile[] = [
  { sport: 'Rowing', weight: 5, namePool: ['Morgonrodd', 'Roddpass', 'Intervaller på roddmaskinen', 'Lugn distansrodd'], distRangeM: [4000, 10000], paceMinPerKm: [4.0, 4.6], durMinRange: null, hr: [135, 168] },
  { sport: 'Run', weight: 3, namePool: ['Löptur', 'Löpning i skogen', 'Intervallpass', 'Söndagslöpning'], distRangeM: [4000, 12000], paceMinPerKm: [5.0, 6.3], durMinRange: null, hr: [140, 175] },
  { sport: 'Ride', weight: 1.5, namePool: ['Cykeltur', 'Pendlingscykling', 'Långcykling'], distRangeM: [15000, 40000], paceMinPerKm: [2.1, 3.0], durMinRange: null, hr: [118, 152] },
  { sport: 'WeightTraining', weight: 0.8, namePool: ['Styrkepass', 'Gympass'], distRangeM: null, paceMinPerKm: null, durMinRange: [30, 55], hr: [98, 132] },
  { sport: 'Yoga', weight: 0.4, namePool: ['Yoga', 'Rörlighetspass'], distRangeM: null, paceMinPerKm: null, durMinRange: [25, 45], hr: [78, 100] },
]

function generateActivities(demoUserId: string) {
  const rows: Array<{
    user_id: string; strava_id: number; sport_type: string; name: string
    distance: number; moving_time: number; elapsed_time: number
    average_heartrate: number | null; max_heartrate: number | null
    start_date: string; description: string; raw_data: Record<string, unknown> | null
  }> = []

  const pool = SPORT_PROFILES.flatMap(p => Array(Math.round(p.weight * 10)).fill(p))
  let stravaIdCounter = -1000

  for (let daysBack = 0; daysBack < 120; daysBack++) {
    // Guarantee a visible current streak; otherwise ~48% of days have a session.
    const forced = daysBack <= 2
    if (!forced && Math.random() > 0.48) continue

    const profile = pick(pool) as SportProfile
    let distance = 0
    let movingTime: number

    if (profile.distRangeM && profile.paceMinPerKm) {
      distance = Math.round(rand(...profile.distRangeM))
      const pace = rand(...profile.paceMinPerKm)
      movingTime = Math.round((distance / 1000) * pace * 60)
    } else {
      movingTime = Math.round(rand(...(profile.durMinRange as [number, number])) * 60)
    }

    const avgHr = randInt(...profile.hr)
    const maxHr = Math.min(195, avgHr + randInt(8, 22))
    const start = daysAgo(daysBack, randInt(6, 20))
    const id = stravaIdCounter--

    let rawData: Record<string, unknown> | null = null
    // A handful of recent sessions get HR zones so the zone bar has data.
    if (daysBack < 14 && distance > 0) {
      const z = [0.1, 0.25, 0.3, 0.25, 0.1].map(f => Math.round(movingTime * f * rand(0.8, 1.2)))
      rawData = { hrZones: z.map((secs, i) => ({ zoneNumber: i + 1, secsInZone: secs })) }
    }
    // The single most recent run gets a small fake GPS loop so the map has something to draw.
    if (daysBack === 0 && profile.sport === 'Run') {
      const baseLat = 57.4305, baseLon = 11.9958 // Onsala-ish coastline
      const points: [number, number][] = []
      const steps = 24
      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * Math.PI * 2
        points.push([baseLat + Math.sin(angle) * 0.01, baseLon + Math.cos(angle) * 0.014])
      }
      rawData = { ...(rawData ?? {}), polyline: points }
    }

    rows.push({
      user_id: demoUserId,
      strava_id: id,
      sport_type: profile.sport,
      name: pick(profile.namePool),
      distance,
      moving_time: movingTime,
      elapsed_time: movingTime + randInt(0, 90),
      average_heartrate: profile.sport === 'Yoga' ? null : avgHr,
      max_heartrate: profile.sport === 'Yoga' ? null : maxHr,
      start_date: start.toISOString(),
      description: `Demo · ${profile.sport}`,
      raw_data: rawData,
    })
  }

  return rows.sort((a, b) => a.start_date.localeCompare(b.start_date))
}

function generateWellnessHistory() {
  const history = []
  for (let daysBack = 0; daysBack < 60; daysBack++) {
    const date = new Date()
    date.setDate(date.getDate() - daysBack)
    const sleepHours = rand(6.2, 8.4)
    const deepHours = sleepHours * rand(0.14, 0.2)
    const remHours = sleepHours * rand(0.18, 0.24)
    history.push({
      date: date.toISOString().slice(0, 10),
      restingHR: randInt(48, 58),
      sleepHours: +sleepHours.toFixed(1),
      deepSleepHours: +deepHours.toFixed(1),
      remSleepHours: +remHours.toFixed(1),
      lightSleepHours: +(sleepHours - deepHours - remHours - 0.3).toFixed(1),
      steps: randInt(5500, 13500),
      bodyBattery: randInt(-15, 55),
      hrv: randInt(38, 72),
      hrvStatus: pick(['BALANCED', 'BALANCED', 'UNBALANCED', 'LOW']),
    })
  }
  return history
}

export async function POST() {
  const sessionClient = await createSupabaseServerClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL
  const demoPassword = process.env.NEXT_PUBLIC_DEMO_PASSWORD
  if (!demoEmail || !demoPassword) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_DEMO_EMAIL/NEXT_PUBLIC_DEMO_PASSWORD saknas i miljövariablerna' }, { status: 500 })
  }

  const admin = createSupabaseAdminClient()

  const { data: existingUsers } = await admin.auth.admin.listUsers({ perPage: 1000 })
  let demoUserId = existingUsers?.users.find(u => u.email === demoEmail)?.id

  if (!demoUserId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: demoEmail, password: demoPassword, email_confirm: true,
    })
    if (error || !created?.user) {
      return NextResponse.json({ error: `Kunde inte skapa demo-konto: ${error?.message}` }, { status: 500 })
    }
    demoUserId = created.user.id
  } else {
    await admin.auth.admin.updateUserById(demoUserId, { password: demoPassword })
  }

  await Promise.all([
    admin.from('activities').delete().eq('user_id', demoUserId),
    admin.from('goals').delete().eq('user_id', demoUserId),
    admin.from('coach_sessions').delete().eq('user_id', demoUserId),
  ])

  const activityRows = generateActivities(demoUserId)
  if (activityRows.length > 0) {
    await admin.from('activities').insert(activityRows)
  }

  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1))
  weekStart.setHours(0, 0, 0, 0)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisWeek = activityRows.filter(a => new Date(a.start_date) >= weekStart)
  const thisMonth = activityRows.filter(a => new Date(a.start_date) >= monthStart)
  const totalKm = Math.round(activityRows.reduce((s, a) => s + a.distance, 0) / 100) / 10

  await admin.from('profiles').update({
    name: 'Demo Andersson',
    daily_step_goal: 10000,
    weight_kg: 78,
    home_equipment: ['Roddmaskin', 'Skivstång', 'Löpband'],
    selected_sports: ['Rowing', 'Run', 'Ride'],
    vo2max_value: 47.5,
    vo2max_source: 'estimated',
    vo2max_date: new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10),
    weekly_load_goal: 420,
  }).eq('id', demoUserId)

  const bio = 'Tränar för att må bra och orka med vardagen — jobbar heltid på kontor, pendlar 40 min varje väg. Gillar variation: rodd, löpning och cykel om vartannat. Mål just nu är att bygga en stabil aerob bas inför hösten och hålla igång styrkepassen en gång i veckan.'

  const goalRow = {
    user_id: demoUserId,
    sport_type: 'Rowing',
    goal_type: 'event' as const,
    title: 'Klara 10 000 m under 42 minuter',
    description: 'Höstens delmål — bygga upp tempo och uthållighet gradvis.',
    target_value: 42,
    target_unit: 'min',
    target_date: new Date(now.getTime() + 60 * 86400000).toISOString().slice(0, 10),
    sessions_per_week: 4,
    status: 'active',
  }
  await admin.from('goals').insert(goalRow)

  const plan = {
    planType: 'mot_mal',
    philosophy: 'Bygg aerob bas med två lugna distanspass, ett kvalitetspass och ett kompletterande styrkepass — undvik att alla pass blir för hårda samtidigt.',
    focusAreas: ['Aerob bas', 'Teknik på roddmaskinen', 'Core-styrka'],
    sessions: [
      { day: 'Måndag', type: 'Distans', description: 'Lugn rodd, 6-8 km i zon 2' },
      { day: 'Onsdag', type: 'Intervaller', description: '6 x 500 m med 2 min vila, högt tempo' },
      { day: 'Torsdag', type: 'Styrka', description: 'Helkropp, fokus rygg och core, 40 min' },
      { day: 'Lördag', type: 'Distans', description: 'Löpning eller cykel, 45-60 min lugnt' },
      { day: 'Söndag', type: 'Rörlighet', description: 'Yoga eller stretching, 30 min' },
    ],
    generatedAt: new Date(now.getTime() - 2 * 3600000).toISOString(),
  }

  const insights = {
    generatedAt: new Date(now.getTime() - 3 * 3600000).toISOString(),
    stats: {
      sessions: activityRows.length,
      thisWeek: thisWeek.length,
      thisMonth: thisMonth.length,
      totalKm,
      pr30: '7,4 km',
    },
    agents: {
      data: 'Stadig ökning i veckovolym senaste månaden. Rodd dominerar men löpning och cykel ger bra variation.',
      recovery: 'Sömn och vilopuls ser stabila ut. Håll koll på Body Battery innan hårda pass.',
      mental: 'Bra motivation senaste veckorna. Fira delmålen, inte bara sluttiden.',
      strength: 'Ett styrkepass i veckan räcker som komplement — fokusera på rygg och core för roddtekniken.',
      mobility: 'Lägg in rörlighet efter de hårdaste passen, särskilt höfter och axlar.',
      summary: '**Bra fart just nu.** Fortsätt med två lugna pass och ett kvalitetspass per vecka. Prioritera sömn inför intervallpassen.',
    },
  }

  const healthInsight = {
    generatedAt: new Date(now.getTime() - 3 * 3600000).toISOString(),
    recovery: 'Vilopuls och HRV pekar på god återhämtning senaste veckan. Fortsätt prioritera sömn.',
    mental: 'Jämn Body Battery-kurva tyder på bra balans mellan träning och vila just nu.',
  }

  await admin.from('coach_sessions').upsert([
    { user_id: demoUserId, coach_id: 'garmin_wellness', messages: [{ role: 'system', content: JSON.stringify({ history: generateWellnessHistory(), updatedAt: new Date().toISOString() }) }] },
    { user_id: demoUserId, coach_id: 'user_context', messages: [{ role: 'user', content: bio }] },
    { user_id: demoUserId, coach_id: 'goals_overview', messages: [{ role: 'user', content: 'Bygga en stabil aerob bas och klara 10 000 m under 42 minuter till hösten.' }] },
    { user_id: demoUserId, coach_id: 'weekly_plan', messages: [{ role: 'system', content: JSON.stringify(plan) }] },
    { user_id: demoUserId, coach_id: 'insights', messages: [{ role: 'system', content: JSON.stringify(insights) }] },
    { user_id: demoUserId, coach_id: 'health_insights', messages: [{ role: 'system', content: JSON.stringify(healthInsight) }] },
  ], { onConflict: 'user_id,coach_id' })

  return NextResponse.json({ ok: true, userId: demoUserId, activities: activityRows.length })
}
