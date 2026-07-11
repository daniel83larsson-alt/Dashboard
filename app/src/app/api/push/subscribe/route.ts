import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { subscription } = await request.json() as {
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
  }
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: 'Ogiltig prenumeration' }, { status: 400 })
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  }, { onConflict: 'endpoint' })

  if (error) {
    console.error('Push subscribe error:', error)
    return NextResponse.json({ error: 'Kunde inte spara prenumerationen' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint } = await request.json() as { endpoint: string }
  if (!endpoint) return NextResponse.json({ error: 'endpoint saknas' }, { status: 400 })

  await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint)
  return NextResponse.json({ ok: true })
}
