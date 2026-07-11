import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchGarminActivities,
  garminActivityToRow,
  fetchGarminRestingHR,
  fetchGarminSleepFull,
  fetchGarminSteps,
  fetchGarminDayWellness,
  fetchGarminHrZones,
  mapActivityType,
} from './garmin'
import { decrypt } from './encrypt'
import { autoCleanupDuplicates } from './duplicates-cleanup'

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

export class GarminNotConfiguredError extends Error {
  constructor() { super('Garmin not configured') }
}

// Core per-user Garmin sync — used both by the session-authenticated route
// (a user syncing themselves) and the cron job (syncing everyone with
// stored credentials). Takes the user id + email explicitly rather than
// pulling them from a session, since the cron caller has neither.
export async function syncGarminForUser(supabase: SupabaseClient, userId: string, userEmail: string | null | undefined) {
  // Daniel: "allt nytt ska synkas, men behöver inte synka mer data bakåt i
  // tiden... 650 dagar är ok för mig, så sliter vi inte på Garmin login."
  // Only the backwards-looking activity BACKFILL is skipped for the admin
  // account — new/recent activities and all wellness data sync exactly as
  // for any other user.
  const isAdminAccount = !!process.env.ADMIN_EMAIL && userEmail === process.env.ADMIN_EMAIL

  const { data: credsRow } = await supabase
    .from('coach_sessions')
    .select('messages')
    .eq('user_id', userId)
    .eq('coach_id', 'garmin_credentials')
    .single()

  const credsStored = (credsRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const userCreds = credsStored ? (() => {
    try {
      const plain = credsStored.length > 100 && !credsStored.startsWith('{')
        ? decrypt(credsStored)
        : credsStored
      return JSON.parse(plain)
    } catch { return null }
  })() : null
  const garminEmail = userCreds?.email
  const garminPassword = userCreds?.password

  if (!garminEmail || !garminPassword) throw new GarminNotConfiguredError()

  const { data: activityCursorRow } = await supabase
    .from('coach_sessions')
    .select('messages')
    .eq('user_id', userId)
    .eq('coach_id', 'garmin_activity_backfill')
    .single()

  const activityCursorRaw = (activityCursorRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const activityCursor: ActivityBackfillCursor = activityCursorRaw
    ? (() => { try { return JSON.parse(activityCursorRaw) } catch { return { offset: 100, done: false } } })()
    : { offset: 100, done: false }

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
    user_id: userId,
    coach_id: 'garmin_activity_backfill',
    messages: [{ role: 'system', content: JSON.stringify(newCursor) }],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,coach_id' })

  const allGarminActivities = [...garminActivities, ...backfillActivities]
    .filter(a => new Date(a.startTimeLocal).getTime() >= activityHistoryCutoff.getTime())

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

  const { data: wellnessRow } = await supabase
    .from('coach_sessions')
    .select('messages')
    .eq('user_id', userId)
    .eq('coach_id', 'garmin_wellness')
    .single()

  const prevRaw = (wellnessRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const prev = prevRaw ? (() => { try { return JSON.parse(prevRaw) } catch { return null } })() : null
  const prevHistory: DayWellness[] = Array.isArray(prev?.history) ? prev.history : []

  const filtered = prevHistory.filter(d => d.date !== today)

  const storedDates = new Set(filtered.map(d => d.date))
  const missingDates: Date[] = []
  for (let i = 1; i <= MAX_HISTORY_DAYS - 1; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    if (!storedDates.has(key)) missingDates.push(d)
  }

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
    user_id: userId,
    coach_id: 'garmin_wellness',
    messages: [{ role: 'system', content: JSON.stringify({ history, updatedAt: new Date().toISOString() }) }],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,coach_id' })

  const { data: existing } = await supabase
    .from('activities')
    .select('strava_id')
    .eq('user_id', userId)
    .gte('strava_id', 0)

  const existingRows = existing ?? []

  const toUpsert = allGarminActivities
    .map(a => garminActivityToRow(a, userId))
    .filter(row => !existingRows.some(e => e.strava_id === row.strava_id))

  if (toUpsert.length > 0) {
    await supabase.from('activities').upsert(toUpsert, { onConflict: 'user_id,strava_id' })
  }

  const cleaned = await autoCleanupDuplicates(supabase, userId)

  let reclassified = 0
  const { data: unclassified } = await supabase
    .from('activities')
    .select('id, raw_data')
    .eq('user_id', userId)
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

  const nowForZones = new Date()
  const startOfThisMonth = new Date(nowForZones.getFullYear(), nowForZones.getMonth(), 1)
  const sevenDaysAgo = new Date(nowForZones)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const zoneSince = startOfThisMonth < sevenDaysAgo ? startOfThisMonth : sevenDaysAgo

  const { data: zoneCandidates } = await supabase
    .from('activities')
    .select('id, strava_id, raw_data')
    .eq('user_id', userId)
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

  return {
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
  }
}
