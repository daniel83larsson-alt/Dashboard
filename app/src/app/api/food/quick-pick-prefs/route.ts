import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

type Body = { name: string; pinned?: boolean; hidden?: boolean }

// Upserts a favorite/hidden flag for one Snabbval entry, keyed on
// lower(name) — the exact grouping food_quick_picks() already uses, so a
// row here always matches exactly one row in the quick-pick list.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as Body
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'Namn saknas' }, { status: 400 })

  const update: { user_id: string; food_name_key: string; pinned?: boolean; hidden?: boolean } = {
    user_id: user.id,
    food_name_key: name.toLowerCase(),
  }
  if (body.pinned != null) update.pinned = body.pinned
  if (body.hidden != null) update.hidden = body.hidden

  const { error } = await supabase.from('food_quick_pick_prefs').upsert(update, { onConflict: 'user_id,food_name_key' })

  if (error) {
    console.error('Quick pick prefs upsert error:', error)
    return NextResponse.json({ error: 'Kunde inte spara' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
