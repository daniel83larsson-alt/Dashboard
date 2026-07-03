import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

const EXTRACTION_SYSTEM = 'Du extraherar strukturerad husdata ur vad användaren skickar in — en bostadsannons, ett mäklarprospekt, ett besiktningsprotokoll eller bara fritext de klistrat in. Svara ENDAST med JSON enligt schema. Sätt fält till null om de inte går att hitta i källan — gissa aldrig.'

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    address: { type: 'STRING', nullable: true },
    build_year: { type: 'INTEGER', nullable: true },
    living_area_sqm: { type: 'NUMBER', nullable: true },
    heating_type: { type: 'STRING', nullable: true },
    energy_class: { type: 'STRING', nullable: true },
  },
  required: ['address', 'build_year', 'living_area_sqm', 'heating_type', 'energy_class'],
}

// Extra, non-schema fields the "sök mer info" feature can find — stored inside
// raw_extracted.research rather than as house_profile columns, so no migration
// is needed to grow this list later.
const RESEARCH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    plot_area_sqm: { type: 'NUMBER', nullable: true },
    rooms: { type: 'INTEGER', nullable: true },
    municipality: { type: 'STRING', nullable: true },
    assessed_value_sek: { type: 'INTEGER', nullable: true },
    latest_sale_price_sek: { type: 'INTEGER', nullable: true },
    latest_sale_date: { type: 'STRING', nullable: true },
    build_year: { type: 'INTEGER', nullable: true },
    energy_class: { type: 'STRING', nullable: true },
    summary: { type: 'STRING', nullable: true },
  },
  required: ['plot_area_sqm', 'rooms', 'municipality', 'assessed_value_sek', 'latest_sale_price_sek', 'latest_sale_date', 'build_year', 'energy_class', 'summary'],
}

const RESEARCH_EXTRACTION_SYSTEM = 'Du strukturerar sökresultat om en svensk bostad till JSON. Använd ENDAST uppgifter som uttryckligen finns i sökresultatet nedan — hitta aldrig på eller gissa värden, och skriv aldrig ut ett uppskattat värde som om det vore ett fastställt. Sätt fält till null om de inte nämns i sökresultatet. "summary" är 1-2 meningar som sammanfattar vad som hittades och varifrån.'

// Strips tags/scripts and collapses whitespace so we send the model readable
// text instead of raw HTML — cheaper and more reliable extraction. Many
// listing sites render with client-side JS, so this can come back thin;
// that's a known limitation (would need a headless-browser fetch to fix),
// not something this route silently pretends to solve.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 15000)
}

// Nominatim (OpenStreetMap) — free, no key, rate-limited to 1 req/s and
// requires an identifying User-Agent per its usage policy.
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`, {
      headers: { 'User-Agent': 'Hemkoll/1.0 (personal home-tracking app)' },
    })
    if (!res.ok) return null
    const results = await res.json()
    if (!results?.[0]) return null
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) }
  } catch {
    return null
  }
}

async function extractViaGemini(
  apiKey: string,
  parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>,
  system: string,
  schema: object
) {
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: {
        maxOutputTokens: 700,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }),
  })
  const data = await res.json()
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!res.ok || !raw) {
    console.error('Gemini extraction error:', data.error ?? res.status)
    throw new Error('AI-anropet misslyckades')
  }
  return JSON.parse(raw) as Record<string, unknown>
}

// Gemini 2.5 rejects combining the google_search tool with responseSchema in
// one call ("controlled generation is not supported with google_search
// tool"), so grounded lookup is two calls: free-text grounded search, then a
// second plain call to structure that text into JSON. Grounding is free up to
// 1500 requests/day on 2.5 Flash — plenty for one household's own lookups.
async function groundedSearch(apiKey: string, address: string): Promise<{ text: string; sources: string[] }> {
  const query = `Sök offentlig information om bostaden på adressen "${address}" i Sverige. Leta efter: taxeringsvärde, tomtarea, antal rum, byggnadstyp, kommun, senaste försäljningspris och -datum, energideklaration/energiklass. Ange varifrån varje uppgift kommer. Om du inget hittar för ett fält, säg det rakt ut istället för att gissa.`
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 1000, thinkingConfig: { thinkingBudget: 0 } },
    }),
  })
  const data = await res.json()
  const raw = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text)
    .filter(Boolean)
    .join('\n')
  if (!res.ok || !raw) {
    console.error('Gemini search error:', data.error ?? res.status)
    throw new Error('Sökningen misslyckades')
  }
  const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
  const sources: string[] = chunks.map((c: { web?: { uri?: string } }) => c.web?.uri).filter((u: string | undefined): u is string => !!u)
  return { text: raw, sources }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI-nyckel saknas i miljön' }, { status: 500 })

    const body = await request.json()
    const mode = body.mode as 'link' | 'text' | 'document' | 'research'

    const { data: current } = await supabase.from('hemkoll_house_profile').select('*').eq('user_id', user.id).single()

    if (mode === 'research') {
      const address = (body.address as string | undefined)?.trim() || current?.address
      if (!address) return NextResponse.json({ error: 'Ingen adress att söka på — spara en adress först' }, { status: 400 })

      const { text: searchText, sources } = await groundedSearch(apiKey, address)
      const extracted = await extractViaGemini(
        apiKey,
        [{ text: `SÖKRESULTAT:\n${searchText}` }],
        RESEARCH_EXTRACTION_SYSTEM,
        RESEARCH_SCHEMA
      )
      return NextResponse.json({ mode, extracted, sources, current: current ?? null })
    }

    let sourceUrl: string | null = null
    let extracted: Record<string, unknown>

    if (mode === 'link') {
      const url = body.url as string
      if (!url?.trim()) return NextResponse.json({ error: 'Länk saknas' }, { status: 400 })
      sourceUrl = url

      let html: string
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HemkollBot/1.0)' } })
        if (!res.ok) throw new Error(`Sidan svarade ${res.status}`)
        html = await res.text()
      } catch {
        return NextResponse.json({ error: 'Kunde inte hämta sidan — kontrollera länken' }, { status: 400 })
      }

      const text = htmlToText(html)
      if (text.length < 200) {
        return NextResponse.json({ error: 'Sidan gav nästan ingen läsbar text (kräver ofta inloggning eller renderas med JS) — prova fritext eller fyll i manuellt istället' }, { status: 422 })
      }
      extracted = await extractViaGemini(apiKey, [{ text: `Extrahera husdata ur texten nedan.\n\nTEXT:\n${text}` }], EXTRACTION_SYSTEM, RESPONSE_SCHEMA)
    } else if (mode === 'text') {
      const text = (body.text as string)?.trim()
      if (!text) return NextResponse.json({ error: 'Text saknas' }, { status: 400 })
      if (text.length < 20) return NextResponse.json({ error: 'För kort text för att extrahera något ur' }, { status: 422 })
      extracted = await extractViaGemini(apiKey, [{ text: `Extrahera husdata ur texten nedan.\n\nTEXT:\n${text.slice(0, 15000)}` }], EXTRACTION_SYSTEM, RESPONSE_SCHEMA)
    } else if (mode === 'document') {
      const fileBase64 = body.fileBase64 as string
      const fileMimeType = body.fileMimeType as string
      if (!fileBase64 || !fileMimeType) return NextResponse.json({ error: 'Dokument saknas' }, { status: 400 })
      if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(fileMimeType)) {
        return NextResponse.json({ error: 'Stödjer PDF, PNG, JPEG eller WebP' }, { status: 400 })
      }
      extracted = await extractViaGemini(apiKey, [
        { text: 'Extrahera husdata ur det bifogade dokumentet.' },
        { inlineData: { mimeType: fileMimeType, data: fileBase64 } },
      ], EXTRACTION_SYSTEM, RESPONSE_SCHEMA)
    } else {
      return NextResponse.json({ error: 'Okänt importläge' }, { status: 400 })
    }

    const address = (extracted.address as string | null) ?? null
    const geo = address ? await geocode(address) : null

    // Nothing is written to the DB here — the client shows a compare (current
    // vs. found) and the user explicitly picks which fields to commit. An
    // earlier version upserted every field straight away, including nulls for
    // whatever the AI didn't find, which silently wiped out previously-saved
    // data on the next import.
    return NextResponse.json({ mode, extracted, geo, current: current ?? null, sourceUrl })
  } catch (err) {
    console.error('Import error:', err)
    return NextResponse.json({ error: 'Import misslyckades' }, { status: 500 })
  }
}
