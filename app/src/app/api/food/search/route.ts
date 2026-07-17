import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export type FoodCandidate = {
  name: string
  brand: string | null
  kcalPer100g: number
  offId: string
  servingGrams: number | null
}

// Open Food Facts — free, keyless, has Swedish products with per-100g
// nutrition. Weak on home-cooked dishes (no barcode), which is exactly why
// the client falls back to an AI text guess when this comes back empty.
const OFF_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl'

function parseServingGrams(servingSize: string | undefined): number | null {
  if (!servingSize) return null
  const match = servingSize.match(/([\d.,]+)\s*g/i)
  if (!match) return null
  const grams = parseFloat(match[1].replace(',', '.'))
  return Number.isFinite(grams) && grams > 0 ? grams : null
}

// OFF's fuzzy matcher can return popular-but-unrelated products for a query
// it doesn't really understand — require at least one shared word (≥3 chars)
// between the query and the product name before trusting a candidate.
function sharesToken(query: string, name: string): boolean {
  const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length >= 3)
  const nameLower = name.toLowerCase()
  return queryTokens.some(t => nameLower.includes(t))
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { query } = await request.json() as { query?: string }
  const trimmed = query?.trim()
  if (!trimmed || trimmed.length < 2) return NextResponse.json({ candidates: [] })

  const url = new URL(OFF_SEARCH_URL)
  url.searchParams.set('search_terms', trimmed)
  url.searchParams.set('search_simple', '1')
  url.searchParams.set('action', 'process')
  url.searchParams.set('json', '1')
  url.searchParams.set('page_size', '20')
  url.searchParams.set('sort_by', 'unique_scans_n')
  url.searchParams.set('fields', 'code,product_name,product_name_sv,brands,nutriments,serving_size')
  url.searchParams.set('lc', 'sv')

  type OffProduct = {
    code: string
    product_name?: string
    product_name_sv?: string
    brands?: string
    serving_size?: string
    nutriments?: { 'energy-kcal_100g'?: number; energy_100g?: number }
  }

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'DL-Trainer/1.0 (kalorifunktion)' } })
    if (!res.ok) return NextResponse.json({ candidates: [] })
    const data = await res.json()
    const products = (data.products ?? []) as OffProduct[]

    const candidates: FoodCandidate[] = products
      .map(p => {
        const name = p.product_name_sv || p.product_name
        if (!name) return null
        const kcalDirect = p.nutriments?.['energy-kcal_100g']
        const kcalFromKj = p.nutriments?.energy_100g != null ? p.nutriments.energy_100g / 4.184 : undefined
        const kcalPer100g = kcalDirect ?? kcalFromKj
        if (!kcalPer100g || kcalPer100g <= 0) return null
        if (!sharesToken(trimmed, name)) return null
        return {
          name,
          brand: p.brands?.split(',')[0]?.trim() || null,
          kcalPer100g: Math.round(kcalPer100g),
          offId: p.code,
          servingGrams: parseServingGrams(p.serving_size),
        }
      })
      .filter((c): c is FoodCandidate => c !== null)
      .slice(0, 12)

    return NextResponse.json({ candidates })
  } catch {
    return NextResponse.json({ candidates: [] })
  }
}
