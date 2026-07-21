import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// TEMPORARY — admin-only diagnostic to see Gemini's actual raw error
// (status + body) instead of guessing whether it's quota exhaustion, a bad
// key, or something else. Delete after use.
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Svara med ordet OK.' }] }],
        generationConfig: { maxOutputTokens: 20, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  )
  const body = await res.text()

  return NextResponse.json({
    status: res.status,
    statusText: res.statusText,
    body: body.slice(0, 2000),
    keyLength: apiKey.length,
    keyPrefix: apiKey.slice(0, 6),
  })
}
