import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// TEMPORARY — admin-only diagnostic to check real quota headroom on a
// candidate cheaper model for THIS project's key, rather than trust generic
// third-party rate-limit blog posts (which disagreed with each other and
// don't reflect this specific project's actual tier/quota bucket). Delete
// after use.
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  const model = request.nextUrl.searchParams.get('model') ?? 'gemini-2.5-flash-lite'

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
    model,
    status: res.status,
    statusText: res.statusText,
    body: body.slice(0, 2000),
  })
}
