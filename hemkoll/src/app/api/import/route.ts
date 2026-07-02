import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

// Strips tags/scripts and collapses whitespace so we send Claude readable
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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { url } = await request.json()
    if (typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ error: 'Länk saknas' }, { status: 400 })
    }

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
      return NextResponse.json({ error: 'Sidan gav nästan ingen läsbar text (kräver ofta inloggning eller renderas med JS) — fyll i manuellt istället' }, { status: 422 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI-nyckel saknas i miljön' }, { status: 500 })
    }

    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: 'Du extraherar strukturerad husdata från text hämtad från en bostadsannons/mäklarprospekt. Svara ENDAST med JSON, inga kommentarer. Sätt fält till null om de inte går att hitta i texten — gissa aldrig.',
      messages: [{
        role: 'user',
        content: `Extrahera följande fält från texten nedan som JSON: {"address": string|null, "build_year": number|null, "living_area_sqm": number|null, "heating_type": string|null, "energy_class": string|null}\n\nTEXT:\n${text}`,
      }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    let extracted: Record<string, unknown>
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    } catch {
      return NextResponse.json({ error: 'Kunde inte tolka svaret från AI:n' }, { status: 500 })
    }

    const profile = {
      user_id: user.id,
      address: extracted.address ?? null,
      build_year: extracted.build_year ?? null,
      living_area_sqm: extracted.living_area_sqm ?? null,
      heating_type: extracted.heating_type ?? null,
      energy_class: extracted.energy_class ?? null,
      source_url: url,
      raw_extracted: extracted,
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase
      .from('hemkoll_house_profile')
      .upsert(profile, { onConflict: 'user_id' })

    if (upsertError) throw upsertError

    return NextResponse.json({ profile })
  } catch (err) {
    console.error('Import error:', err)
    return NextResponse.json({ error: 'Import misslyckades' }, { status: 500 })
  }
}
