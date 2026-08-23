import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchYazioDailySummary, fetchYazioConsumedItems } from './yazio'
import { decrypt } from './encrypt'
import { summaryToYazioDay, type YazioDay } from './yazio-history'
import { stockholmDateKey } from './dates'

export class YazioNotConfiguredError extends Error {
  constructor() { super('YAZIO not configured') }
}

// Same amount of history Garmin wellness keeps a rolling window of, minus
// the year-long depth — food/macro trends are meaningful over weeks, not a
// full year, and it keeps the stored JSON blob small.
const MAX_HISTORY_DAYS = 90

export async function syncYazioForUser(supabase: SupabaseClient, userId: string) {
  const { data: credsRow } = await supabase
    .from('coach_sessions')
    .select('messages')
    .eq('user_id', userId)
    .eq('coach_id', 'yazio_credentials')
    .single()

  const credsStored = (credsRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const creds = credsStored ? (() => {
    try { return JSON.parse(decrypt(credsStored)) } catch { return null }
  })() : null
  const email = creds?.email
  const password = creds?.password
  if (!email || !password) throw new YazioNotConfiguredError()

  const today = new Date()
  const todayKey = stockholmDateKey(today)
  const [summary, consumedItems] = await Promise.all([
    fetchYazioDailySummary(email, password, today),
    fetchYazioConsumedItems(email, password, today),
  ])

  // Kept for inspection while the exact field mapping is still being
  // refined against real accounts — see STATUS.md. Cheap: overwritten
  // every sync, never grows.
  await supabase.from('coach_sessions').upsert({
    user_id: userId,
    coach_id: 'yazio_raw_debug',
    messages: [{ role: 'system', content: JSON.stringify({ fetchedAt: new Date().toISOString(), date: todayKey, summary, consumedItems }) }],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,coach_id' })

  const todayDay = summaryToYazioDay(todayKey, summary)

  const { data: historyRow } = await supabase
    .from('coach_sessions')
    .select('messages')
    .eq('user_id', userId)
    .eq('coach_id', 'yazio_history')
    .single()
  const historyStored = (historyRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const prevHistory: YazioDay[] = historyStored ? (() => {
    try { return JSON.parse(historyStored) } catch { return [] }
  })() : []

  const history = [todayDay, ...prevHistory.filter(d => d.date !== todayKey)]
    .filter((d): d is YazioDay => d !== null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_HISTORY_DAYS)

  await supabase.from('coach_sessions').upsert({
    user_id: userId,
    coach_id: 'yazio_history',
    messages: [{ role: 'system', content: JSON.stringify(history) }],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,coach_id' })

  return { ok: true, hasSummary: !!summary, hasConsumedItems: !!consumedItems, today: todayDay }
}
