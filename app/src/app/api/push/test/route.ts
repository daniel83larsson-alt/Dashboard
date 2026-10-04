import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { sendPushToUser } from '@/lib/push'
import { isDemoAccount, DEMO_BLOCKED_MESSAGE } from '@/lib/demo'

// "Skicka testnotis" i Profil: skickar en riktig push till användarens egna
// enheter och svarar med vad push-tjänsten sa, så ett uteblivet pling går att
// felsöka direkt (inga enheter / fel hos Apple / Google) i stället för att gissa.
export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isDemoAccount(user.email)) return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 })

  const { data: subs } = await supabase.from('push_subscriptions').select('id').eq('user_id', user.id)
  const devices = subs?.length ?? 0
  if (devices === 0) return NextResponse.json({ devices: 0, sent: 0, failed: 0, errors: [] })

  const r = await sendPushToUser(supabase, user.id, {
    title: 'Testnotis från DL Trainer',
    body: 'Fick du den här fungerar notiserna på den här enheten.',
    url: '/dashboard/profil',
  })
  return NextResponse.json({ devices, ...r })
}
