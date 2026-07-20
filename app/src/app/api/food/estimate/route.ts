import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { logApiCall } from '@/lib/log-api-call'
import { checkAndConsumeRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { decryptMaybeLegacy } from '@/lib/encrypt'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

const ESTIMATE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: 'Rättens namn på svenska' },
    kcal: { type: 'INTEGER', description: 'Uppskattade kalorier för EN normal portion' },
    protein_g: { type: 'INTEGER', description: 'Uppskattat protein i gram för EN normal portion' },
    portion_desc: { type: 'STRING', description: 'T.ex. "1 normal portion (~250 g)"' },
    confidence: { type: 'STRING', description: '"hög", "medel" eller "låg"' },
  },
  required: ['name', 'kcal', 'protein_g', 'portion_desc', 'confidence'],
}

const ESTIMATE_SYSTEM = 'Du uppskattar kalorier och protein för en maträtt utifrån en kort beskrivning eller en bild. Svara med rättens namn på svenska, en kaloriuppskattning och en proteinuppskattning (gram) för EN normal portion. Gissa aldrig löjligt exakt — det är en uppskattning, inte en labbmätning. Svara ENDAST med JSON enligt schema.'

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_BASE64_LENGTH = 8_000_000 // ~6MB decoded, generous for a phone photo

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })

    const body = await request.json() as { mode: 'text' | 'photo'; description?: string; imageBase64?: string; mimeType?: string }

    let parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>
    if (body.mode === 'text') {
      const description = body.description?.trim()
      if (!description) return NextResponse.json({ error: 'Beskrivning saknas' }, { status: 400 })
      parts = [{ text: `Uppskatta kalorier för: ${description.slice(0, 300)}` }]
    } else if (body.mode === 'photo') {
      if (!body.imageBase64 || !body.mimeType) return NextResponse.json({ error: 'Bild saknas' }, { status: 400 })
      if (!ALLOWED_IMAGE_TYPES.includes(body.mimeType)) return NextResponse.json({ error: 'Stödjer JPEG, PNG eller WebP' }, { status: 400 })
      if (body.imageBase64.length > MAX_IMAGE_BASE64_LENGTH) return NextResponse.json({ error: 'Bilden är för stor' }, { status: 400 })
      parts = [
        { text: 'Identifiera maträtten på bilden och uppskatta kalorier för en normal portion.' },
        { inlineData: { mimeType: body.mimeType, data: body.imageBase64 } },
      ]
    } else {
      return NextResponse.json({ error: 'Okänt läge' }, { status: 400 })
    }

    logApiCall(supabase, user.id, 'food_estimate')

    const { data: profile } = await supabase.from('profiles').select('llm_api_key_encrypted').eq('id', user.id).single()
    const apiKey = profile?.llm_api_key_encrypted ? decryptMaybeLegacy(profile.llm_api_key_encrypted) : process.env.GEMINI_API_KEY!

    if (!profile?.llm_api_key_encrypted) {
      const rate = await checkAndConsumeRateLimit(supabase, user.id)
      if (!rate.allowed) return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 })
    }

    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        systemInstruction: { parts: [{ text: ESTIMATE_SYSTEM }] },
        generationConfig: {
          maxOutputTokens: 250,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          responseSchema: ESTIMATE_SCHEMA,
        },
      }),
    })
    const data = await res.json()
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!res.ok || !raw) {
      console.error('Gemini food estimate error:', data.error ?? res.status)
      return NextResponse.json({ error: 'AI-uppskattningen misslyckades' }, { status: 502 })
    }

    const parsed = JSON.parse(raw) as { name: string; kcal: number; protein_g: number; portion_desc: string; confidence: string }
    return NextResponse.json({ ...parsed, source: body.mode === 'photo' ? 'photo' : 'ai_text' })
  } catch (err) {
    console.error('Food estimate error:', err)
    return NextResponse.json({ error: 'Något gick fel' }, { status: 500 })
  }
}
