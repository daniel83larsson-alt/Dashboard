import type { SupabaseClient } from '@supabase/supabase-js'
import { warmGarminClient, exportGarminTokens, type GarminTokens } from './garmin'
import { decrypt, encrypt } from './encrypt'

// Shared by every call site that talks to Garmin (the nightly/on-open sync,
// and the two on-demand per-activity routes) — loads whatever OAuth session
// was saved last time and hands it to warmGarminClient so a real
// username/password login only happens when there's no session yet or the
// stored one has genuinely died (see garmin.ts's own comment for why this
// matters: Garmin mails a "new login" security notice for every real login,
// regardless of source region).
export async function loadAndWarmGarminSession(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  password: string,
): Promise<void> {
  const { data: tokensRow } = await supabase
    .from('coach_sessions')
    .select('messages')
    .eq('user_id', userId)
    .eq('coach_id', 'garmin_tokens')
    .single()

  const tokensStored = (tokensRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const storedTokens: GarminTokens | null = tokensStored ? (() => {
    try { return JSON.parse(decrypt(tokensStored)) } catch { return null }
  })() : null

  await warmGarminClient(email, password, storedTokens)
}

// Call after the Garmin work for this user is done, so next time reuses
// this run's (possibly freshly-logged-in or freshly-refreshed) session
// instead of another real login.
export async function persistGarminSession(supabase: SupabaseClient, userId: string, email: string): Promise<void> {
  const freshTokens = exportGarminTokens(email)
  if (!freshTokens) return
  await supabase.from('coach_sessions').upsert({
    user_id: userId,
    coach_id: 'garmin_tokens',
    messages: [{ role: 'system', content: encrypt(JSON.stringify(freshTokens)) }],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,coach_id' })
}
