import type { SupabaseClient } from '@supabase/supabase-js'
import { currentDailyStreak, currentWeeklyStreak } from './streaks'
import { sendPushToUser } from './push'

// Rundade OCH kalendermässigt meningsfulla tal — Daniel nämnde uttryckligen
// "5 veckor" och "52 veckor, 1 år!!!" som exempel, så listan är kurerad för
// hand snarare än en ren multipel-formel (som skulle missa 52/365).
export const MILESTONES = [5, 7, 10, 14, 21, 25, 30, 50, 52, 75, 100, 150, 200, 250, 365, 500, 730, 1000] as const

export function isMilestone(n: number): boolean {
  return (MILESTONES as readonly number[]).includes(n)
}

export type StreakKind = 'daily_streak' | 'weekly_streak' | 'habit_streak'

export type StreakCandidate = {
  kind: StreakKind
  streakKey: string // 'daily' | 'weekly' | habit id
  value: number
  label: string // t.ex. "dagar i rad", "veckor på raken", eller vanans titel
}

export type ReachedMilestone = StreakCandidate & { message: string }

function unitWord(kind: StreakKind, streakKey: string): 'dagar' | 'veckor' | 'perioder' {
  if (kind === 'daily_streak') return 'dagar'
  if (kind === 'weekly_streak') return 'veckor'
  // habit_streak: vi vet inte här om vanan är daglig/veckovis/eget intervall
  // (bara streakKey=habit-id finns tillgängligt) — "gånger i rad" fungerar
  // oavsett intervall utan att gissa fel enhet.
  void streakKey
  return 'perioder'
}

function milestoneMessage(c: StreakCandidate): string {
  const unit = unitWord(c.kind, c.streakKey)
  if (c.kind === 'daily_streak' && c.value === 365) return `🎉 ${c.label}: 365 dagar i rad — ett helt år!!!`
  if (c.kind === 'weekly_streak' && c.value === 52) return `🎉 ${c.label}: 52 veckor på raken — ett helt år!!!`
  if (c.kind === 'habit_streak') return `🎉 ${c.label}: ${c.value} gånger i rad!!`
  return `🎉 ${c.label}: ${c.value} ${unit} på raken!!`
}

// Försöker skriva in varje kandidat som når en milstolpe — unik-constraint
// gör att bara helt nya (aldrig tidigare firade) kombinationer faktiskt
// sparas. Returnerar EXAKT de som var nya just nu, redo att visas/pushas.
// Säker att anropa varje sidladdning/synk — ett upprepat anrop med samma
// värde ger bara tillbaka en tom lista andra gången, ingen dubbelfirning.
export async function recordNewMilestones(
  supabase: SupabaseClient,
  userId: string,
  candidates: StreakCandidate[]
): Promise<ReachedMilestone[]> {
  const hits = candidates.filter(c => isMilestone(c.value))
  if (!hits.length) return []

  const rows = hits.map(c => ({ user_id: userId, kind: c.kind, streak_key: c.streakKey, milestone: c.value }))
  const { data: inserted } = await supabase
    .from('celebrated_milestones')
    .upsert(rows, { onConflict: 'user_id,kind,streak_key,milestone', ignoreDuplicates: true })
    .select('kind, streak_key, milestone')

  const insertedSet = new Set((inserted ?? []).map(r => `${r.kind}|${r.streak_key}|${r.milestone}`))
  return hits
    .filter(c => insertedSet.has(`${c.kind}|${c.streakKey}|${c.value}`))
    .map(c => ({ ...c, message: milestoneMessage(c) }))
}

// Shared by every place a new activity can land (manual log, each sync
// source, the daily sync-all cron) — recomputes the training streaks from
// that user's own activities and pushes immediately if a new milestone was
// just crossed, instead of waiting for the evening streak-reminder cron.
export async function checkAndPushMilestones(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: activities } = await supabase
    .from('activities')
    .select('start_date')
    .eq('user_id', userId)
  if (!activities?.length) return

  const candidates: StreakCandidate[] = [
    { kind: 'daily_streak', streakKey: 'daily', value: currentDailyStreak(activities), label: 'Träningsstreak' },
    { kind: 'weekly_streak', streakKey: 'weekly', value: currentWeeklyStreak(activities), label: 'Träningsstreak' },
  ]
  const reached = await recordNewMilestones(supabase, userId, candidates)
  if (!reached.length) return

  await sendPushToUser(supabase, userId, {
    title: 'Ny milstolpe! 🎉',
    body: reached[0].message.replace('🎉 ', ''),
    url: '/dashboard',
  })
}
