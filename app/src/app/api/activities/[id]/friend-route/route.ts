import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

// GPS map for a FRIEND's activity, shown when their row is expanded in
// "Mina vänners träningspass" (Daniel: "klicka på en kompis pass och få
// upp gps karta om de finns sådant data"). Deliberately different from
// garmin-route/route.ts (the caller's own activity): this only ever reads
// whatever is ALREADY cached in raw_data — it never triggers a live Garmin
// login on the activity owner's behalf. Garmin's login endpoint is known
// to be rate-limit-fragile (see STATUS.md, sync-all's Garmin batching), and
// a friend's page view has no business kicking off someone else's Garmin
// session; it just means an uncached pass shows "ingen kartdata" instead
// of a map until the owner has viewed it themselves at least once.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createSupabaseAdminClient()

    const { data: activity } = await admin
      .from('activities')
      .select('id, user_id, source, raw_data')
      .eq('id', id)
      .single()

    if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Own activity — nothing to check, but this route is only ever called
    // for a friend's row from the UI, so this is just a defensive no-op.
    if (activity.user_id !== user.id) {
      const { data: friendship } = await admin
        .from('follows')
        .select('id')
        .eq('status', 'accepted')
        .or(`and(follower_id.eq.${user.id},followee_id.eq.${activity.user_id}),and(follower_id.eq.${activity.user_id},followee_id.eq.${user.id})`)
        .limit(1)
        .maybeSingle()

      if (!friendship) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const raw = (activity.raw_data ?? {}) as Record<string, unknown>
    const lat = typeof raw.startLatitude === 'number' ? raw.startLatitude : null
    const lng = typeof raw.startLongitude === 'number' ? raw.startLongitude : null
    const polyline = Array.isArray(raw.polyline) ? raw.polyline : null

    return NextResponse.json({ lat, lng, polyline })
  } catch (err) {
    console.error('Friend route error:', err)
    return NextResponse.json({ error: 'Något gick fel' }, { status: 500 })
  }
}
