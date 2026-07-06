import type { SupabaseClient } from "@supabase/supabase-js";

// Fire-and-forget logging for the admin abuse-check (Daniel: "vill kunna
// administrera och ha lite koll" even before he books anything himself).
// Only wired into the one call here that costs money -- AI receipt
// parsing. A logging failure must never break the actual request, so
// errors are swallowed.
export function logApiCall(supabase: SupabaseClient, userId: string, route: string) {
  supabase.from("api_call_log").insert({ user_id: userId, route }).then(
    () => {},
    () => {}
  );
}
