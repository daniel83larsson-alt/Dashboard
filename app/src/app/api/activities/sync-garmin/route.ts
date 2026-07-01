import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import {
  fetchGarminActivities,
  garminActivityToRow,
  fetchGarminRestingHR,
  fetchGarminSleepFull,
  fetchGarminSteps,
  fetchGarminDayWellness,
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

    // Fetch everything in parallel
    const [garminActivities, backfillActivities, restingHR, sleep, steps] = await Promise.all([
      fetchGarminActivities(100, garminEmail, garminPassword),
      activityCursor.done
        ? Promise.resolve([])
        : fetchGarminActivities(ACTIVITY_BACKFILL_BATCH_SIZE, garminEmail, garminPassword, activityCursor.offset),
      fetchGarminRestingHR(garminEmail, garminPassword),
      fetchGarminSleepFull(garminEmail, garminPassword),
      fetchGarminSteps(garminEmail, garminPassword),
    ])

    const newCursor: ActivityBackfillCursor = activityCursor.done
      ? activityCursor
      : {
          offset: activityCursor.offset + backfillActivities.length,
          done: backfillActivities.length < ACTIVITY_BACKFILL_BATCH_SIZE,
        }

    await supabase.from('coach_sessions').upsert({
      user_id: user.id,
      coach_id: 'garmin_activity_backfill',
      messages: [{ role: 'system', content: JSON.stringify(newCursor) }],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,coach_id' })

    const allGarminActivities = [...garminActivities, ...backfillActivities]

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

    // Fetch existing activities to detect duplicates — cover the full date
    // range of both the recent batch and any older backfilled batch
    const allDates = allGarminActivities.map(a => new Date(a.startTimeLocal).getTime())
    const since = allDates.length
      ? new Date(Math.min(...allDates)).toISOString()
      : new Date(0).toISOString()

    const { data: existing } = await supabase
      .from('activities')
      .select('strava_id, start_date, distance, moving_time, sport_type')
      .eq('user_id', user.id)
      .gte('start_date', since)

    const existingRows = existing ?? []

    const toUpsert = allGarminActivities
      .map(a => garminActivityToRow(a, user.id))
      .filter(row => {
        if (existingRows.some(e => e.strava_id === row.strava_id)) return false

        const rowDist = row.distance ?? 0
        const rowTime = row.moving_time ?? 0
        if (row.sport_type === 'Rowing' && rowDist > 0 && rowTime > 0) {
          const rowDate = row.start_date.slice(0, 10)
          const duplicate = existingRows.some(e => {
            if (e.strava_id >= 0) return false
            if (!e.distance || !e.moving_time) return false
            const eDate = e.start_date.slice(0, 10)
            if (eDate !== rowDate) return false
            const distMatch = Math.abs(e.distance - rowDist) / rowDist < 0.05
            const timeMatch = Math.abs(e.moving_time - rowTime) / rowTime < 0.05
            return distMatch && timeMatch
          })
          if (duplicate) return false
        }

        return true
      })

    if (toUpsert.length > 0) {
      await supabase.from('activities').upsert(toUpsert, { onConflict: 'user_id,strava_id' })
    }

    const cleaned = await autoCleanupDuplicates(supabase, user.id)

    return NextResponse.json({
      synced: toUpsert.length,
      wellness: todayWellness,
      backfilled: backfilled.length,
      remainingGaps,
      activitiesBackfilled: backfillActivities.length,
      activitiesBackfillDone: newCursor.done,
      cleaned,
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
