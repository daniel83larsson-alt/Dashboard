import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// Public, no-auth unsubscribe link, same shape as /api/newsletter/unsubscribe
// but flips the SEPARATE weekly_digest_opt_out flag — a Veckans Recap
// unsubscribe must never silently also opt someone out of feature-news
// emails, or vice versa.
export async function GET(request: NextRequest) {
  const uid = request.nextUrl.searchParams.get('uid')
  if (!uid) return NextResponse.json({ error: 'Saknar uid' }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  await supabase.rpc('unsubscribe_weekly_digest', { target_user_id: uid })

  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Avanmäld</title></head>
    <body style="font-family:sans-serif;background:#0e1113;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
      <div style="text-align:center;">
        <h1 style="color:#ccd400;">Du är avanmäld</h1>
        <p>Du kommer inte längre få Veckans Recap på mail. Du kan slå på det igen under Profil.</p>
      </div>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}
