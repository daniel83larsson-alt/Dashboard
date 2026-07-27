import type { SupabaseClient } from '@supabase/supabase-js'

// Fire-and-forget logging for the admin abuse-check (STATUS.md/Daniel:
// "koll på antal anrop per dag per användare"). Only wired into the
// routes that cost money or can hit an external service's rate limit —
// never plain navigation. A logging failure must never break the actual
// request, so errors are swallowed.
export function logApiCall(supabase: SupabaseClient, userId: string, route: string) {
  supabase.from('api_call_log').insert({ user_id: userId, route }).then(
    () => {},
    () => {}
  )
}
