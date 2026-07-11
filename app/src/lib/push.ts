import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'

let configured = false
function ensureConfigured() {
  if (configured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) throw new Error('VAPID keys not configured')
  webpush.setVapidDetails('mailto:daniel83larsson@gmail.com', publicKey, privateKey)
  configured = true
}

export type PushPayload = { title: string; body: string; url?: string }

// Sends to every device a user has enabled notifications on, and quietly
// forgets any subscription the push service reports as gone (410/404) —
// browsers drop subscriptions silently (uninstall, long offline, OS
// cleanup), so this is the only place that ever finds out and cleans up.
export async function sendPushToUser(supabase: SupabaseClient, userId: string, payload: PushPayload): Promise<{ sent: number }> {
  ensureConfigured()

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs?.length) return { sent: 0 }

  let sent = 0
  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
      sent++
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      }
    }
  }))

  return { sent }
}
