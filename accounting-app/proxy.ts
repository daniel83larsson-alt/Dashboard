import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed Middleware to Proxy. It runs on every request
// (including prefetches), so this only does an optimistic, cookie-presence
// check — no network round trip to Supabase here. The authoritative check
// (supabase.auth.getUser()) happens in app/(app)/layout.tsx, which only
// runs for an actual page render.
function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /^sb-.*-auth-token/.test(c.name));
}

export function proxy(request: NextRequest) {
  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");

  if (!isAuthRoute && !hasSupabaseSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
