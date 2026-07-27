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

export type RateLimitDecision = {
  result: RateLimitResult
  // The state to persist, or null when the request was rejected — a
  // rejected request never touches the stored window/count, same as the
  // original inline logic (only a successful, consumed request writes).
  nextState: RateState | null
}

function parseStoredState(raw: string | null | undefined): RateState | null {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// Pure decision logic, split out from the I/O wrapper below so it's
// unit-testable without a real (or mocked) Supabase client — same split as
// plan-reconcile.ts's planReconcileDecisions/reconcileUserPlanSessions.
// Takes the raw stored JSON string exactly as it comes back from the
// coach_sessions row (parsing included) so the "corrupt/unparseable stored
// value" contract lives and is tested in one place: it's treated the same
// as no prior state at all, i.e. a fresh window starts.
export function nextRateLimitState(prevRaw: string | null | undefined, now: number): RateLimitDecision {
  let state: RateState = parseStoredState(prevRaw) ?? { windowStart: now, count: 0, lastAt: 0 }

  // Fixed hourly window — resets to a clean slate rather than a rolling
  // window, so "how much do I have left" stays simple to reason about.
  if (now - state.windowStart >= WINDOW_MS) {
    state = { windowStart: now, count: 0, lastAt: 0 }
  }

  if (state.lastAt && now - state.lastAt < MIN_SPACING_MS) {
    return {
      result: { allowed: false, retryAfterSec: Math.ceil((MIN_SPACING_MS - (now - state.lastAt)) / 1000), reason: 'spacing' },
      nextState: null,
    }
  }

  if (state.count >= HOURLY_LIMIT) {
    return {
      result: { allowed: false, retryAfterSec: Math.ceil((state.windowStart + WINDOW_MS - now) / 1000), reason: 'hourly' },
      nextState: null,
    }
  }

  return {
    result: { allowed: true },
    nextState: { ...state, count: state.count + 1, lastAt: now },
  }
}

export async function checkAndConsumeRateLimit(supabase: SupabaseClient, userId: string): Promise<RateLimitResult> {
  const { data: row } = await supabase
    .from('coach_sessions')
    .select('messages')
    .eq('user_id', userId)
    .eq('coach_id', 'rate_limit')
    .single()

  const raw = (row?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const { result, nextState } = nextRateLimitState(raw, Date.now())

  if (nextState) {
    await supabase.from('coach_sessions').upsert({
      user_id: userId,
      coach_id: 'rate_limit',
      messages: [{ role: 'system', content: JSON.stringify(nextState) }],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,coach_id' })
  }

  return result
}

export function rateLimitMessage(result: Extract<RateLimitResult, { allowed: false }>): string {
  if (result.reason === 'spacing') {
    return 'Vänta någon sekund innan nästa meddelande.'
  }
  const mins = Math.ceil(result.retryAfterSec / 60)
  return `Den delade gratis-AI-kvoten är slut för den här timmen (delas mellan alla som testar appen). Försök igen om ${mins} min, eller lägg in din egen gratis Gemini-nyckel under Profil för obegränsad användning.`
}
