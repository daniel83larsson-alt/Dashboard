import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { parseQuickPickOverride } from '@/lib/quick-pick-override'

// Sparar användarens egna kcal/protein för en rätt i Snabbval. Gäller bara
// framtida loggningar (gamla måltider rörs aldrig) — se lib/quick-pick-override.ts.
// Nyckel = lower(name), samma gruppering som food_quick_picks_v2() använder.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = parseQuickPickOverride(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { error } = await supabase.from('food_quick_pick_overrides').upsert({
    user_id: user.id,
    food_name_key: parsed.name.toLowerCase(),
    calories: parsed.calories,
    protein_g: parsed.proteinG,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,food_name_key' })

  if (error) {
    console.error('Quick pick override upsert error:', error)
    return NextResponse.json({ error: 'Kunde inte spara' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
