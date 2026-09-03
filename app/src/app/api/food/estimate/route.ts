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
    carb_g: { type: 'INTEGER', description: 'Uppskattade kolhydrater i gram för EN normal portion' },
    fat_g: { type: 'INTEGER', description: 'Uppskattat fett i gram för EN normal portion' },
    portion_desc: { type: 'STRING', description: 'T.ex. "1 normal portion (~250 g)"' },
    confidence: { type: 'STRING', description: '"hög", "medel" eller "låg"' },
  },
  required: ['name', 'kcal', 'protein_g', 'carb_g', 'fat_g', 'portion_desc', 'confidence'],
}

const ESTIMATE_SYSTEM_TEXT = 'Du uppskattar näringsvärde för en maträtt utifrån en kort beskrivning. Svara med rättens namn på svenska, samt kalorier, protein, kolhydrater och fett (alla i gram utom kalorier) för EN normal portion. Gissa aldrig löjligt exakt — det är en uppskattning, inte en labbmätning. Svara ENDAST med JSON enligt schema.'

const ESTIMATE_SYSTEM_DISH = 'Du uppskattar näringsvärde för en maträtt utifrån en eller flera bilder av rätten (t.ex. flera vinklar för säkrare bedömning). Identifiera rätten och svara med dess namn på svenska, samt kalorier, protein, kolhydrater och fett (alla i gram utom kalorier) för EN normal portion. Gissa aldrig löjligt exakt — det är en uppskattning, inte en labbmätning. Svara ENDAST med JSON enligt schema.'

const ESTIMATE_SYSTEM_LABEL = 'Du läser av näringsvärdesetiketten på en förpackning från en eller flera bilder (t.ex. framsida + etikett). Läs av de faktiska siffrorna från etiketten (per portion om angivet, annars per 100 g omräknat till en rimlig portion) hellre än att gissa. Svara med produktens namn på svenska, samt kalorier, protein, kolhydrater och fett för EN portion enligt etiketten. Sätt "confidence" till "hög" om siffrorna går att läsa tydligt. Svara ENDAST med JSON enligt schema.'

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_BASE64_LENGTH = 8_000_000 // ~6MB decoded, generous for a phone photo
const MAX_IMAGES = 4

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })

    const body = await request.json() as {
      mode: 'text' | 'photo'
      description?: string
      images?: { data: string; mimeType: string }[]
      photoKind?: 'dish' | 'label'
      note?: string
    }

    let parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>
    let systemInstruction: string
    if (body.mode === 'text') {
      const description = body.description?.trim()
      if (!description) return NextResponse.json({ error: 'Beskrivning saknas' }, { status: 400 })
      parts = [{ text: `Uppskatta näringsvärde för: ${description.slice(0, 300)}` }]
      systemInstruction = ESTIMATE_SYSTEM_TEXT
    } else if (body.mode === 'photo') {
      const images = body.images ?? []
      if (images.length === 0) return NextResponse.json({ error: 'Bild saknas' }, { status: 400 })
      if (images.length > MAX_IMAGES) return NextResponse.json({ error: `Max ${MAX_IMAGES} bilder` }, { status: 400 })
      for (const img of images) {
        if (!img.data || !img.mimeType) return NextResponse.json({ error: 'Bild saknas' }, { status: 400 })
        if (!ALLOWED_IMAGE_TYPES.includes(img.mimeType)) return NextResponse.json({ error: 'Stödjer JPEG, PNG eller WebP' }, { status: 400 })
        if (img.data.length > MAX_IMAGE_BASE64_LENGTH) return NextResponse.json({ error: 'Bilden är för stor' }, { status: 400 })
      }
      const isLabel = body.photoKind === 'label'
      const note = body.note?.trim().slice(0, 300)
      parts = [
        { text: isLabel ? 'Läs av näringsvärdesetiketten på bilderna.' : 'Identifiera maträtten på bilderna och uppskatta näringsvärde för en normal portion.' },
        ...(note ? [{ text: `Extra kontext från användaren: ${note}` }] : []),
        ...images.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
      ]
      systemInstruction = isLabel ? ESTIMATE_SYSTEM_LABEL : ESTIMATE_SYSTEM_DISH
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
        systemInstruction: { parts: [{ text: systemInstruction }] },
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

    const parsed = JSON.parse(raw) as { name: string; kcal: number; protein_g: number; carb_g: number; fat_g: number; portion_desc: string; confidence: string }
    return NextResponse.json({ ...parsed, source: body.mode === 'photo' ? 'photo' : 'ai_text' })
  } catch (err) {
    console.error('Food estimate error:', err)
    return NextResponse.json({ error: 'Något gick fel' }, { status: 500 })
  }
}
