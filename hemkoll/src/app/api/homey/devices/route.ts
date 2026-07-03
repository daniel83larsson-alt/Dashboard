import { NextRequest, NextResponse } from 'next/server'
import { APIError } from 'homey-api'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createHomeyCloudApi } from '@/lib/homey'

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const origin = new URL(request.url).origin
  const cloudApi = createHomeyCloudApi(user.id, `${origin}/api/homey/callback`)

  const loggedIn = await cloudApi.isLoggedIn()
  if (!loggedIn) return NextResponse.json({ connected: false })

  try {
    const cloudUser = await cloudApi.getAuthenticatedUser()
    const homey = cloudUser.getFirstHomey()
    if (!homey) return NextResponse.json({ connected: true, devices: [], note: 'Inga Homeys hittades på kontot' })

    // homey.authenticate() resolves to whichever API version this Homey
    // speaks (V1/V2/V3), which the public types don't unify — all versions
    // expose `.devices.getDevices()` per Homey's own SDK example, so we
    // narrow to just that shared surface here.
    const homeyApi = await homey.authenticate() as unknown as {
      devices: { getDevices(): Promise<Record<string, unknown>> }
    }
    const devices = await homeyApi.devices.getDevices()

    const simplified = Object.values(devices as Record<string, {
      id: string
      name: string
      zoneName?: string
      zone?: string
      class: string
      available: boolean
      capabilitiesObj?: Record<string, { value?: unknown }>
    }>).map(d => ({
      id: d.id,
      name: d.name,
      zone: d.zoneName ?? d.zone ?? null,
      class: d.class,
      available: d.available,
      power: d.capabilitiesObj?.measure_power?.value ?? null,
      energyTotal: d.capabilitiesObj?.meter_power?.value ?? null,
    }))

    return NextResponse.json({ connected: true, devices: simplified })
  } catch (err) {
    // A revoked or expired-beyond-refresh token surfaces here as a 401 from
    // Homey's API — forget the stale connection so the UI can offer to
    // reconnect instead of failing silently on every load.
    if (err instanceof APIError && (err.statusCode === 401 || err.statusCode === 403)) {
      await supabase.from('hemkoll_homey_connections').delete().eq('user_id', user.id)
      return NextResponse.json({ connected: false, note: 'Åtkomsten verkar återkallad — anslut igen' })
    }
    console.error('Homey devices error:', err)
    return NextResponse.json({ error: 'Kunde inte hämta enheter från Homey' }, { status: 502 })
  }
}
