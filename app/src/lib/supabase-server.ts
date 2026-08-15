import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient<DB>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component during render, where Next.js
            // forbids writing cookies (the two Sentry errors this fixes:
            // "Cookies can only be modified in a Server Action or Route
            // Handler" + the Server Components render failure it caused).
            // Safe to ignore — proxy.ts's middleware already refreshes the
            // session cookie on every /dashboard and /login request, so
            // this call (triggered by an expiring-token auto-refresh mid
            // render) is a redundant write, not the only place it happens.
          }
        },
      },
    }
  )
}
