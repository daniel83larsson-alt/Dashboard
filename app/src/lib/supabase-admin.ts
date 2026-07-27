import { createClient } from '@supabase/supabase-js'

// Service-role client for contexts with no logged-in user (cron jobs) —
// bypasses RLS entirely, so it must only ever be used from trusted
// server-only code that already gated access another way (e.g. the cron
// secret check), never exposed to a request driven directly by a client.
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
