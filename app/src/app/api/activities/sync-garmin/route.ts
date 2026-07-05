import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import {
  fetchGarminActivities,
  garminActivityToRow,
  fetchGarminRestingHR,
  fetchGarminSleepFull,
  fetchGarminSteps,
  fetchGarminDayWellness,
  fetchGarminHrZones,
  mapActivityType,
} from '@/lib/garmin'
import { decrypt } from '@/lib/encrypt'
import { autoCleanupDuplicates } from '@/lib/duplicates-cleanup'

// How much wellness history we keep and how many missing days we backfill
// per sync call. A new user's history fills in gradually — each sync (auto
// or manual) fetches the next batch of missing days rather than the whole
// year at once, to stay well within Garmin's unofficial API rate limits.
const MAX_HISTORY_DAYS = 365
const BACKFILL_BATCH_SIZE = 20
const ACTIVITY_BACKFILL_BATCH_SIZE = 25 // older pass history — kept modest so a big lifetime history doesn't hammer Garmin in one sync

// Pass history itself (not just wellness) is also capped at a year back —
// older activities aren't useful for training analysis and just inflate
// "days synced" indefinitely (Daniel's own account reached 650 days before
// this cap existed).
const ACTIVITY_HISTORY_MAX_DAYS = 365

// HR-zone backfill: deliberately scoped to "this week + this month" for now
// (not full history) and fetched a few at a time, since this hits Garmin's
// unofficial per-activity zone endpoint once per pass — wider historical
// coverage can be added later if it's worth the extra load.
const ZONE_BACKFILL_BATCH_SIZE = 5

type ActivityBackfillCursor = { offset: number; done: boolean }

export type DayWellness = {
  date: string
  restingHR: number | null
  sleepHours: number | null
  deepSleepHours: number | null
  remSleepHours: number | null
  lightSleepHours: number | null
  steps: number | null
  bodyBattery: number | null
  hrv: number | null
  hrvStatus: string | null
}

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Daniel: "allt nytt ska synkas, men behöver inte synka mer data bakåt
    // i tiden... 650 dagar är ok för mig, så sliter vi inte på Garmin
    // login." Only the backwards-looking activity BACKFILL is skipped for
    // the admin account — new/recent activities and all wellness data
    // (sleep/resting HR/steps/body battery) sync exactly as for any other
    // user. Two earlier attempts were too broad: first paused the whole
    // route (killed wellness too), second paused all activity syncing
    // (would've silently stopped new passes from appearing at all).
    const isAdminAccount = !!process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL

    // Resolve credentials: user's own first, env vars as fallback
    const { data: credsRow } = await supabase
      .from('coach_sessions')
      .select('messages')
      .eq('user_id', user.id)
      .eq('coach_id', 'garmin_credentials')
      .single()

    const credsStored = (credsRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
    const userCreds = credsStored ? (() => {
      try {
        // Try decrypting first; fall back to plain JSON for legacy records
        const plain = credsStored.length > 100 && !credsStored.startsWith('{')
          ? decrypt(credsStored)
          : credsStored
        return JSON.parse(plain)
      } catch { return null }
    })() : null
    // No shared/env-var fallback: each user must connect their own Garmin
    // account via Profil, otherwise their sync would silently pull whoever
    // owns the shared credentials' activities into their account.
    const garminEmail = userCreds?.email
    const garminPassword = userCreds?.password

    if (!garminEmail || !garminPassword) {
      return NextResponse.json({ error: 'Garmin not configured' }, { status: 400 })
    }

    // Load activity-backfill cursor (older pass history beyond the most recent 100)
    const { data: activityCursorRow } = await supabase
      .from('coach_sessions')
      .select('messages')
      .eq('user_id', user.id)
      .eq('coach_id', 'garmin_activity_backfill')
      .single()

    const activityCursorRaw = (activityCursorRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
    const activityCursor: ActivityBackfillCursor = activityCursorRaw
      ? (() => { try { return JSON.parse(activityCursorRaw) } catch { return { offset: 100, done: false } } })()
      : { offset: 100, done: false }

    // Fetch everything in parallel — only the older-history backfill is
    // skipped for the admin account; recent activities and wellness always
    // run, same as any other user.
    const [garminActivities, backfillActivities, restingHR, sleep, steps] = await Promise.all([
      fetchGarminActivities(100, garminEmail, garminPassword),
      isAdminAccount || activityCursor.done
        ? Promise.resolve([])
        : fetchGarminActivities(ACTIVITY_BACKFILL_BATCH_SIZE, garminEmail, garminPassword, activityCursor.offset),
      fetchGarminRestingHR(garminEmail, garminPassword),
      fetchGarminSleepFull(garminEmail, garminPassword),
      fetchGarminSteps(garminEmail, garminPassword),
    ])

    const activityHistoryCutoff = new Date()
    activityHistoryCutoff.setDate(activityHistoryCutoff.getDate() - ACTIVITY_HISTORY_MAX_DAYS)
    const oldestInBatch = backfillActivities.length
      ? Math.min(...backfillActivities.map(a => new Date(a.startTimeLocal).getTime()))
      : null
    const reachedHistoryCutoff = oldestInBatch !== null && oldestInBatch < activityHistoryCutoff.getTime()

    const newCursor: ActivityBackfillCursor = activityCursor.done
      ? activityCursor
      : {
          offset: activityCursor.offset + backfillActivities.length,
          done: backfillActivities.length < ACTIVITY_BACKFILL_BATCH_SIZE || reachedHistoryCutoff,
        }

    await supabase.from('coach_sessions').upsert({
      user_id: user.id,
      coach_id: 'garmin_activity_backfill',
      messages: [{ role: 'system', content: JSON.stringify(newCursor) }],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,coach_id' })

    const allGarminActivities = [...garminActivities, ...backfillActivities]
      .filter(a => new Date(a.startTimeLocal).getTime() >= activityHistoryCutoff.getTime())

    // Build today's wellness snapshot
    const today = new Date().toISOString().slice(0, 10)
    const todayWellness: DayWellness = {
      date: today,
      restingHR: sleep?.restingHR ?? restingHR,
      sleepHours: sleep?.hours ?? null,
      deepSleepHours: sleep?.deepHours ?? null,
      remSleepHours: sleep?.remHours ?? null,
      lightSleepHours: sleep?.lightHours ?? null,
      steps,
      bodyBattery: sleep?.bodyBattery ?? null,
      hrv: sleep?.hrv ?? null,
      hrvStatus: sleep?.hrvStatus ?? null,
    }

    // Load existing wellness history and merge (keep 30 days)
    const { data: wellnessRow } = await supabase
      .from('coach_sessions')
      .select('messages')
      .eq('user_id', user.id)
      .eq('coach_id', 'garmin_wellness')
      .single()

    const prevRaw = (wellnessRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
    const prev = prevRaw ? (() => { try { return JSON.parse(prevRaw) } catch { return null } })() : null
    const prevHistory: DayWellness[] = Array.isArray(prev?.history) ? prev.history : []

    const filtered = prevHistory.filter(d => d.date !== today)

    // Backfill missing days — find gaps in the history window and fetch them
    const storedDates = new Set(filtered.map(d => d.date))
    const missingDates: Date[] = []
    for (let i = 1; i <= MAX_HISTORY_DAYS - 1; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      if (!storedDates.has(key)) missingDates.push(d)
    }

    // Fetch one batch of missing days per sync to avoid Garmin rate limits —
    // a full year backfills over several syncs rather than one huge burst
    const toBackfill = missingDates.slice(0, BACKFILL_BATCH_SIZE)
    const remainingGaps = missingDates.length - toBackfill.length
    const backfilled: DayWellness[] = []
    if (toBackfill.length > 0) {
      const results = await Promise.allSettled(
        toBackfill.map(d => fetchGarminDayWellness(d, garminEmail, garminPassword))
      )
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') return
        const { restingHR: hr, sleep: s, steps: st } = r.value
        backfilled.push({
          date: toBackfill[i].toISOString().slice(0, 10),
          restingHR: s?.restingHR ?? hr,
          sleepHours: s?.hours ?? null,
          deepSleepHours: s?.deepHours ?? null,
          remSleepHours: s?.remHours ?? null,
          lightSleepHours: s?.lightHours ?? null,
          steps: st,
          bodyBattery: s?.bodyBattery ?? null,
          hrv: s?.hrv ?? null,
          hrvStatus: s?.hrvStatus ?? null,
        })
      })
    }

    const history = [todayWellness, ...backfilled, ...filtered]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((d, i, arr) => arr.findIndex(x => x.date === d.date) === i)
      .slice(0, MAX_HISTORY_DAYS)

    await supabase.from('coach_sessions').upsert({
      user_id: user.id,
      coach_id: 'garmin_wellness',
      messages: [{ role: 'system', content: JSON.stringify({ history, updatedAt: new Date().toISOString() }) }],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,coach_id' })

    // Fetch already-synced Garmin activity ids so this sync doesn't re-upsert
    // the same activity every time it runs
    const { data: existing } = await supabase
      .from('activities')
      .select('strava_id')
      .eq('user_id', user.id)
      .gte('strava_id', 0)

    const existingRows = existing ?? []

    // Only skip a Garmin activity that's already been synced (same
    // strava_id) — a Garmin row that happens to match an existing Concept2
    // pass by distance/time is intentionally still inserted now, so both
    // sources exist and get merged for display (Passlogg, dashboard,
    // detail page) instead of the Concept2 row being the only survivor.
    const toUpsert = allGarminActivities
      .map(a => garminActivityToRow(a, user.id))
      .filter(row => !existingRows.some(e => e.strava_id === row.strava_id))

    if (toUpsert.length > 0) {
      await supabase.from('activities').upsert(toUpsert, { onConflict: 'user_id,strava_id' })
    }

    const cleaned = await autoCleanupDuplicates(supabase, user.id)

    // Self-heal previously-synced Garmin activities that fell back to the
    // generic 'Workout' bucket under an older, narrower type mapping — the
    // real Garmin typeKey is preserved in raw_data, so this re-derives the
    // sport each sync without needing a one-off migration.
    let reclassified = 0
    const { data: unclassified } = await supabase
      .from('activities')
      .select('id, raw_data')
      .eq('user_id', user.id)
      .eq('sport_type', 'Workout')
      .gte('strava_id', 0)
    for (const row of unclassified ?? []) {
      const typeKey = (row.raw_data as { activityType?: { typeKey?: string } } | null)?.activityType?.typeKey
      if (!typeKey) continue
      const newType = mapActivityType(typeKey)
      if (newType !== 'Workout') {
        await supabase.from('activities').update({ sport_type: newType }).eq('id', row.id)
        reclassified++
      }
    }

    // Gradual HR-zone backfill for this week + this month's Garmin passes —
    // fetched a few at a time each sync rather than all at once.
    const nowForZones = new Date()
    const startOfThisMonth = new Date(nowForZones.getFullYear(), nowForZones.getMonth(), 1)
    const sevenDaysAgo = new Date(nowForZones)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const zoneSince = startOfThisMonth < sevenDaysAgo ? startOfThisMonth : sevenDaysAgo

    const { data: zoneCandidates } = await supabase
      .from('activities')
      .select('id, strava_id, raw_data')
      .eq('user_id', user.id)
      .gte('strava_id', 0)
      .gte('start_date', zoneSince.toISOString())

    const missingZones = (zoneCandidates ?? []).filter(a => !(a.raw_data as { hrZones?: unknown } | null)?.hrZones)
    const zoneBatch = missingZones.slice(0, ZONE_BACKFILL_BATCH_SIZE)
    let zonesBackfilled = 0
    for (const row of zoneBatch) {
      const zones = await fetchGarminHrZones(row.strava_id, garminEmail, garminPassword)
      if (zones) {
        const raw = (row.raw_data as Record<string, unknown> | null) ?? {}
        await supabase.from('activities').update({ raw_data: { ...raw, hrZones: zones } }).eq('id', row.id)
        zonesBackfilled++
      }
    }
    const zonesRemaining = missingZones.length - zoneBatch.length

    return NextResponse.json({
      synced: toUpsert.length,
      wellness: todayWellness,
      backfilled: backfilled.length,
      remainingGaps,
      activitiesBackfilled: backfillActivities.length,
      activitiesBackfillDone: newCursor.done,
      cleaned,
      reclassified,
      zonesBackfilled,
      zonesRemaining,
    })
  } catch (err) {
    console.error('Garmin sync error:', err)
    return NextResponse.json({ error: 'Garmin sync failed' }, { status: 500 })
  }
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ configured: true })
}
