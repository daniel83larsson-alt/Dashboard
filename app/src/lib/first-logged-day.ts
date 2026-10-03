import type { SupabaseClient } from '@supabase/supabase-js'
import type { YazioDay } from '@/lib/yazio-history'

// The user's first-ever logged day (YYYY-MM-DD, same slice(0,10) key the
// rest of the nutrition code uses), or null if they never logged. Looked up
// with a dedicated cheap query rather than from a windowed fetch, otherwise a
// 7-day window would make "first logged day" always look like "7 days ago".
// Pure part split out so it can be unit tested without a database.
export function earliestLoggedKey(foodLogFirstIso: string | null, yazioHistory: YazioDay[]): string | null {
  const keys: string[] = []
  if (foodLogFirstIso) keys.push(foodLogFirstIso.slice(0, 10))
  for (const d of yazioHistory) if (d.kcalEaten != null) keys.push(d.date)
  return keys.length > 0 ? keys.reduce((a, b) => (a < b ? a : b)) : null
}

// Split from fetchFirstLoggedKey so callers can run this query inside their
// existing Promise.all and combine with earliestLoggedKey afterwards.
export function fetchFirstFoodLogIso(supabase: SupabaseClient, userId: string) {
  return supabase.from('food_log').select('logged_at')
    .eq('user_id', userId).order('logged_at', { ascending: true }).limit(1)
    .then(({ data }) => (data?.[0]?.logged_at as string | undefined) ?? null)
}

export async function fetchFirstLoggedKey(supabase: SupabaseClient, userId: string, yazioHistory: YazioDay[]): Promise<string | null> {
  return earliestLoggedKey(await fetchFirstFoodLogIso(supabase, userId), yazioHistory)
}
