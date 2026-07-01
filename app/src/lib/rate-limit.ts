import type { SupabaseClient } from '@supabase/supabase-js'

// Protects the shared/default Gemini key's tight free-tier quota (10
// requests/min, 250/day — across ALL users combined, not per person) from
// any single user's burst or heavy day. Only meant to be checked when the
// caller is about to use the shared key — anyone with their own API key has
// their own separate quota and should never be rate-limited by this.
const HOURLY_LIMIT = 15
const WINDOW_MS = 60 * 60 * 1000
const MIN_SPACING_MS = 4000

type RateState = { windowStart: number; count: number; lastAt: number }
export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number; reason: 'spacing' | 'hourly' }

export async function checkAndConsumeRateLimit(supabase: SupabaseClient, userId: string): Promise<RateLimitResult> {
  const { data: row } = await supabase
    .from('coach_sessions')
    .select('messages')
    .eq('user_id', userId)
    .eq('coach_id', 'rate_limit')
    .single()

  const raw = (row?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const prev: RateState | null = raw ? (() => { try { return JSON.parse(raw) } catch { return null } })() : null

  const now = Date.now()
  let state: RateState = prev ?? { windowStart: now, count: 0, lastAt: 0 }

  // Fixed hourly window — resets to a clean slate rather than a rolling
  // window, so "how much do I have left" stays simple to reason about.
  if (now - state.windowStart >= WINDOW_MS) {
    state = { windowStart: now, count: 0, lastAt: 0 }
  }

  if (state.lastAt && now - state.lastAt < MIN_SPACING_MS) {
    return { allowed: false, retryAfterSec: Math.ceil((MIN_SPACING_MS - (now - state.lastAt)) / 1000), reason: 'spacing' }
  }

  if (state.count >= HOURLY_LIMIT) {
    return { allowed: false, retryAfterSec: Math.ceil((state.windowStart + WINDOW_MS - now) / 1000), reason: 'hourly' }
  }

  state.count += 1
  state.lastAt = now

  await supabase.from('coach_sessions').upsert({
    user_id: userId,
    coach_id: 'rate_limit',
    messages: [{ role: 'system', content: JSON.stringify(state) }],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,coach_id' })

  return { allowed: true }
}

export function rateLimitMessage(result: Extract<RateLimitResult, { allowed: false }>): string {
  if (result.reason === 'spacing') {
    return 'Vänta någon sekund innan nästa meddelande.'
  }
  const mins = Math.ceil(result.retryAfterSec / 60)
  return `Den delade gratis-AI-kvoten är slut för den här timmen (delas mellan alla som testar appen). Försök igen om ${mins} min, eller lägg in din egen gratis Gemini-nyckel under Profil för obegränsad användning.`
}
