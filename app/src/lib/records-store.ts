import type { SupabaseClient } from '@supabase/supabase-js'
import { sessionsOf, recordLabelsBySession, monthlyTotals } from './records-engine'
import type { ActivityRow } from './duplicates'

// Skriver rekord (activity_records) och månadssummor (activity_monthly) för en användare utifrån
// alla hens pass. Körs med tjänsteroll. Anropas när passen har ändrats (records_dirty, satt av
// en databastrigger på activities) och av den dagliga avstämningen — aldrig vid sidvisning.

export type RecordRow = { activity_id: string; user_id: string; label: string; achieved_at: string }
export type MonthRow = { user_id: string; month: string; moving_time_sec: number; distance_m: number; sessions: number }

const PAGE = 1000

async function loadActivities(admin: SupabaseClient, userId: string): Promise<ActivityRow[]> {
  const rows: ActivityRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('activities')
      .select('id, strava_id, start_date, distance, moving_time, sport_type, source, calories')
      .eq('user_id', userId)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`activities read failed: ${error.message}`)
    for (const r of data ?? []) rows.push({ ...r, distance: Number(r.distance ?? 0), source: r.source ?? undefined } as ActivityRow)
    if (!data || data.length < PAGE) break
  }
  return rows
}

// Ren: vad som ska läggas till/uppdateras respektive tas bort för att tabellen ska matcha målet.
export function planChanges<T>(existing: T[], desired: T[], keyOf: (r: T) => string, sameValue: (a: T, b: T) => boolean) {
  const ex = new Map(existing.map(r => [keyOf(r), r]))
  const want = new Map(desired.map(r => [keyOf(r), r]))
  const upsert = desired.filter(r => { const e = ex.get(keyOf(r)); return !e || !sameValue(e, r) })
  const remove = existing.filter(r => !want.has(keyOf(r)))
  return { upsert, remove }
}

export type RefreshResult = { records: number; months: number; changed: number }

export async function refreshUserRecords(admin: SupabaseClient, userId: string): Promise<RefreshResult> {
  const sessions = sessionsOf(await loadActivities(admin, userId))
  const labels = recordLabelsBySession(sessions)
  const byId = new Map(sessions.map(s => [s.id, s]))

  const desiredRecords: RecordRow[] = []
  for (const [activityId, ls] of labels) for (const label of ls) {
    desiredRecords.push({ activity_id: activityId, user_id: userId, label, achieved_at: new Date(byId.get(activityId)!.start_date).toISOString() })
  }
  const desiredMonths: MonthRow[] = Object.entries(monthlyTotals(sessions)).map(([month, b]) => ({
    user_id: userId, month, moving_time_sec: Math.round(b.sec), distance_m: Math.round(b.m), sessions: b.n,
  }))

  const [{ data: exRecords, error: e1 }, { data: exMonths, error: e2 }] = await Promise.all([
    admin.from('activity_records').select('activity_id, user_id, label, achieved_at').eq('user_id', userId),
    admin.from('activity_monthly').select('user_id, month, moving_time_sec, distance_m, sessions').eq('user_id', userId),
  ])
  if (e1 || e2) throw new Error(`records read failed: ${(e1 ?? e2)!.message}`)

  const recordPlan = planChanges(
    (exRecords ?? []).map(r => ({ ...r, achieved_at: new Date(r.achieved_at).toISOString() })) as RecordRow[],
    desiredRecords,
    r => `${r.activity_id}|${r.label}`,
    (a, b) => a.achieved_at === b.achieved_at,
  )
  const monthPlan = planChanges(
    (exMonths ?? []).map(m => ({ ...m, moving_time_sec: Number(m.moving_time_sec), distance_m: Number(m.distance_m) })) as MonthRow[],
    desiredMonths,
    m => m.month,
    (a, b) => a.moving_time_sec === b.moving_time_sec && a.distance_m === b.distance_m && a.sessions === b.sessions,
  )

  if (recordPlan.upsert.length) {
    const { error } = await admin.from('activity_records').upsert(recordPlan.upsert, { onConflict: 'activity_id,label' })
    if (error) throw new Error(`activity_records upsert failed: ${error.message}`)
  }
  for (const r of recordPlan.remove) {
    const { error } = await admin.from('activity_records').delete().eq('activity_id', r.activity_id).eq('label', r.label)
    if (error) throw new Error(`activity_records delete failed: ${error.message}`)
  }
  if (monthPlan.upsert.length) {
    const { error } = await admin.from('activity_monthly').upsert(monthPlan.upsert.map(m => ({ ...m, updated_at: new Date().toISOString() })), { onConflict: 'user_id,month' })
    if (error) throw new Error(`activity_monthly upsert failed: ${error.message}`)
  }
  for (const m of monthPlan.remove) {
    const { error } = await admin.from('activity_monthly').delete().eq('user_id', userId).eq('month', m.month)
    if (error) throw new Error(`activity_monthly delete failed: ${error.message}`)
  }

  return {
    records: desiredRecords.length,
    months: desiredMonths.length,
    changed: recordPlan.upsert.length + recordPlan.remove.length + monthPlan.upsert.length + monthPlan.remove.length,
  }
}

// Räknar om alla som markerats "smutsiga". Tar bort markeringen bara om ingen nyare ändring kommit
// under tiden (annars lämnas den kvar och tas nästa varv).
export async function refreshDirtyUsers(admin: SupabaseClient, limit = 5): Promise<{ processed: { userId: string; result: RefreshResult }[]; failed: { userId: string; error: string }[]; remaining: number }> {
  const { data: dirty, error } = await admin.from('records_dirty').select('user_id, dirty_since').order('dirty_since').limit(limit)
  if (error) throw new Error(`records_dirty read failed: ${error.message}`)
  const processed: { userId: string; result: RefreshResult }[] = []
  const failed: { userId: string; error: string }[] = []
  for (const d of dirty ?? []) {
    try {
      const result = await refreshUserRecords(admin, d.user_id)
      await admin.from('records_dirty').delete().eq('user_id', d.user_id).lte('dirty_since', d.dirty_since)
      processed.push({ userId: d.user_id, result })
    } catch (e) {
      failed.push({ userId: d.user_id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  const { count } = await admin.from('records_dirty').select('user_id', { count: 'exact', head: true })
  return { processed, failed, remaining: count ?? 0 }
}

// Daglig avstämning: räknar om ALLA och rapporterar hur många rader som behövde rättas. Allt över 0
// betyder att uppdateringen via "smutsig"-markeringen missat något och bör undersökas.
export async function reconcileAllUsers(admin: SupabaseClient): Promise<{ users: number; drift: { userId: string; changed: number }[]; failed: { userId: string; error: string }[] }> {
  const { data: profiles, error } = await admin.from('profiles').select('id')
  if (error) throw new Error(`profiles read failed: ${error.message}`)
  const drift: { userId: string; changed: number }[] = []
  const failed: { userId: string; error: string }[] = []
  for (const p of profiles ?? []) {
    try {
      const r = await refreshUserRecords(admin, p.id)
      if (r.changed > 0) drift.push({ userId: p.id, changed: r.changed })
    } catch (e) {
      failed.push({ userId: p.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { users: profiles?.length ?? 0, drift, failed }
}
