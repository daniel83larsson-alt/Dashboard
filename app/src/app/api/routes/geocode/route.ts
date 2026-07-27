import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'Sökterm saknas' }, { status: 400 })

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'DLTrainer/1.0 (personal training-route search)' },
    })
    if (!res.ok) return NextResponse.json({ error: 'Sökningen misslyckades' }, { status: 502 })
    const results = await res.json()
    if (!results?.[0]) return NextResponse.json({ error: 'Hittade ingen plats' }, { status: 404 })
    return NextResponse.json({
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
      label: results[0].display_name as string,
    })
  } catch {
    return NextResponse.json({ error: 'Sökningen misslyckades' }, { status: 502 })
  }
}
