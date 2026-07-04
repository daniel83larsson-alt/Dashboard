import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

const EXTRACTION_SYSTEM = 'Du extraherar strukturerad husdata ur vad användaren skickar in — en bostadsannons, ett mäklarprospekt, ett besiktningsprotokoll eller bara fritext/anteckningar de klistrat in. Fånga så mycket som möjligt av: grundfakta (adress, byggår, boyta, biarea/källararea, tomtarea, antal rum, byggnadstyp t.ex. villa/radhus/kedjehus/parhus, köppris, köpår, taxeringsvärde, energiklass, energiprestanda i kWh/m²/år), driftskostnad uppdelad per kategori (värme, el, vatten/avlopp, sophämtning, försäkring, sotning, samfällighet/väg, övrigt) plus totalsumma om den anges, ALLA uppvärmningssystem som nämns var för sig (inte bara ett — många hus kombinerar t.ex. pelletspanna, solceller och vedkamin), smart hem-plattform, solcellsdata, elbilsladdning, tidigare renoveringar, och pågående/planerade projekt (med kostnad/besparing om det nämns). heating_type ska vara en kort sammanfattning i en mening; heating_systems ska lista varje system för sig. Svara ENDAST med JSON enligt schema. Sätt fält till null (eller tom lista) om de inte går att hitta i källan — gissa aldrig, hitta aldrig på siffror eller fakta som inte står i texten.'

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    address: { type: 'STRING', nullable: true },
    build_year: { type: 'INTEGER', nullable: true },
    living_area_sqm: { type: 'NUMBER', nullable: true },
    basement_area_sqm: { type: 'NUMBER', nullable: true },
    plot_area_sqm: { type: 'NUMBER', nullable: true },
    rooms: { type: 'NUMBER', nullable: true, description: 'Antal rum, t.ex. 5 eller 4.5' },
    building_type: { type: 'STRING', nullable: true, description: 'T.ex. villa, radhus, kedjehus, parhus' },
    heating_type: { type: 'STRING', nullable: true },
    energy_class: { type: 'STRING', nullable: true },
    energy_performance_kwh_sqm: { type: 'NUMBER', nullable: true, description: 'Energiprestanda i kWh/m² och år, från energideklarationen' },
    purchase_price_sek: { type: 'INTEGER', nullable: true },
    purchase_year: { type: 'INTEGER', nullable: true },
    assessed_value_sek: { type: 'INTEGER', nullable: true, description: 'Taxeringsvärde' },
    operating_cost_sek: {
      type: 'OBJECT',
      nullable: true,
      description: 'Driftskostnad per år, uppdelad per kategori. Sätt bara total om källan inte bryter ner den.',
      properties: {
        heating: { type: 'INTEGER', nullable: true },
        electricity: { type: 'INTEGER', nullable: true },
        water_sewage: { type: 'INTEGER', nullable: true },
        waste: { type: 'INTEGER', nullable: true },
        insurance: { type: 'INTEGER', nullable: true },
        chimney_sweep: { type: 'INTEGER', nullable: true },
        community_fee: { type: 'INTEGER', nullable: true },
        other: { type: 'INTEGER', nullable: true },
        total: { type: 'INTEGER', nullable: true },
      },
      required: ['heating', 'electricity', 'water_sewage', 'waste', 'insurance', 'chimney_sweep', 'community_fee', 'other', 'total'],
    },
    smart_home_platform: { type: 'STRING', nullable: true },
    heating_systems: {
      type: 'ARRAY',
      nullable: true,
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', nullable: true },
          role: { type: 'STRING', nullable: true, description: 'T.ex. primär, komplement, reserv, endast rumsvärme' },
          installed_year: { type: 'INTEGER', nullable: true },
          notes: { type: 'STRING', nullable: true },
        },
        required: ['type', 'role', 'installed_year', 'notes'],
      },
    },
    solar_pv: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        capacity_kw: { type: 'NUMBER', nullable: true },
        production_kwh_last_year: { type: 'NUMBER', nullable: true },
        consumption_kwh_last_year: { type: 'NUMBER', nullable: true },
        self_sufficiency_pct: { type: 'NUMBER', nullable: true },
      },
      required: ['capacity_kw', 'production_kwh_last_year', 'consumption_kwh_last_year', 'self_sufficiency_pct'],
    },
    ev_charging: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        annual_kwh: { type: 'NUMBER', nullable: true },
        charger: { type: 'STRING', nullable: true },
      },
      required: ['annual_kwh', 'charger'],
    },
    renovations: {
      type: 'ARRAY',
      nullable: true,
      items: { type: 'STRING' },
      description: 'Korta punkter om tidigare genomförda renoveringar/förbättringar',
    },
    ongoing_projects: {
      type: 'ARRAY',
      nullable: true,
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', nullable: true },
          goal: { type: 'STRING', nullable: true },
          estimated_cost_sek: { type: 'INTEGER', nullable: true },
          expected_savings_sek: { type: 'INTEGER', nullable: true },
          notes: { type: 'STRING', nullable: true },
        },
        required: ['title', 'goal', 'estimated_cost_sek', 'expected_savings_sek', 'notes'],
      },
    },
    strategy_notes: { type: 'STRING', nullable: true, description: 'Ekonomiska principer eller strategi kring huset, om det nämns' },
  },
  required: [
    'address', 'build_year', 'living_area_sqm', 'basement_area_sqm', 'plot_area_sqm', 'rooms', 'building_type',
    'heating_type', 'energy_class', 'energy_performance_kwh_sqm', 'purchase_price_sek', 'purchase_year',
    'assessed_value_sek', 'operating_cost_sek', 'smart_home_platform', 'heating_systems', 'solar_pv',
    'ev_charging', 'renovations', 'ongoing_projects', 'strategy_notes',
  ],
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

class GeminiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

async function extractViaGemini(
  apiKey: string,
  parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>,
  system: string,
  schema: object,
  maxOutputTokens = 700
) {
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: {
        maxOutputTokens,
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
    throw new GeminiError('AI-anropet misslyckades', res.status)
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
    throw new GeminiError('Sökningen misslyckades', res.status)
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
      extracted = await extractViaGemini(apiKey, [{ text: `Extrahera husdata ur texten nedan.\n\nTEXT:\n${text}` }], EXTRACTION_SYSTEM, RESPONSE_SCHEMA, 3500)
    } else if (mode === 'text') {
      const text = (body.text as string)?.trim()
      if (!text) return NextResponse.json({ error: 'Text saknas' }, { status: 400 })
      if (text.length < 20) return NextResponse.json({ error: 'För kort text för att extrahera något ur' }, { status: 422 })
      extracted = await extractViaGemini(apiKey, [{ text: `Extrahera husdata ur texten nedan.\n\nTEXT:\n${text.slice(0, 15000)}` }], EXTRACTION_SYSTEM, RESPONSE_SCHEMA, 3500)
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
      ], EXTRACTION_SYSTEM, RESPONSE_SCHEMA, 3500)
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
    if (err instanceof GeminiError && err.status === 429) {
      return NextResponse.json({ error: 'AI-tjänsten är hårt belastad just nu (gratis-kvoten är tillfälligt full) — vänta en minut och försök igen' }, { status: 429 })
    }
    console.error('Import error:', err)
    return NextResponse.json({ error: 'Import misslyckades' }, { status: 500 })
  }
}
