import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchYazioDailySummary, fetchYazioConsumedItems } from './yazio'
import { decrypt } from './encrypt'

export class YazioNotConfiguredError extends Error {
  constructor() { super('YAZIO not configured') }
}

// First-pass sync: connect, fetch, and store the RAW response for
// inspection — deliberately NOT mapped into food_log yet. The exact
// shape of a real account's data (which meal slots are actually used,
// whether energy comes back in kcal or kJ, whether recipe_portions /
// simple_products carry anything for a normal user) needs to be seen
// against a real connected account before deciding how to fold it into
// the existing food_log rows the rest of the app already reads.
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
  const [summary, consumedItems] = await Promise.all([
    fetchYazioDailySummary(email, password, today),
    fetchYazioConsumedItems(email, password, today),
  ])

  const raw = {
    fetchedAt: new Date().toISOString(),
    date: today.toISOString().slice(0, 10),
    summary,
    consumedItems,
  }

  await supabase.from('coach_sessions').upsert({
    user_id: userId,
    coach_id: 'yazio_raw_debug',
    messages: [{ role: 'system', content: JSON.stringify(raw) }],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,coach_id' })

  return { ok: true, hasSummary: !!summary, hasConsumedItems: !!consumedItems, raw }
}
