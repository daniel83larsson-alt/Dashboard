import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getSession() (not getUser()) on purpose: this is only a fast-path
  // redirect for the obvious cases (no cookie at all / already logged in),
  // not the actual security boundary — it reads the JWT from the cookie
  // and checks its local expiry without a network round trip to Supabase.
  // Middleware runs before ANY HTML can stream, so a slow check here was
  // blocking the entire page on every single dashboard/login request,
  // stacked on top of dashboard/layout.tsx's own check right after it.
  // The real, server-verified check stays in layout.tsx's getUser() call,
  // which still runs before any protected content renders — a forged or
  // stale-but-unexpired cookie gets past this fast path but is caught
  // there, same as it always was.
  const { data: { session } } = await supabase.auth.getSession()

  if (!session && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Every authenticated page carries another user's private data if it's
  // ever served to the wrong person — belt-and-braces on top of the
  // per-request Supabase queries: no browser, proxy, or CDN layer is
  // allowed to cache and replay this response for whoever loads the URL
  // next on a shared device.
  response.headers.set('Cache-Control', 'no-store, must-revalidate')
  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
}
