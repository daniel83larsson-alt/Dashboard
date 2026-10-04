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

export type PushSendError = { status: number | null; body: string }
export type PushSendResult = { sent: number; failed: number; removed: number; errors: PushSendError[] }

// Sends to every device a user has enabled notifications on and forgets any
// subscription the push service reports as gone (410/404) — browsers drop
// subscriptions silently (uninstall, long offline, OS cleanup).
//
// Every outcome is recorded on the subscription row (last_success_at /
// last_error_*) and logged. Earlier this swallowed every error except
// 404/410, so a cron route reported "reminded: N" for pushes that never
// arrived and nobody could tell why (Daniel: "uteblivna notiser").
export async function sendPushToUser(supabase: SupabaseClient, userId: string, payload: PushPayload): Promise<PushSendResult> {
  ensureConfigured()
  const result: PushSendResult = { sent: 0, failed: 0, removed: 0, errors: [] }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs?.length) return result

  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
      result.sent++
      await supabase.from('push_subscriptions')
        .update({ last_success_at: new Date().toISOString(), last_error_at: null, last_error_status: null, last_error_body: null })
        .eq('id', sub.id)
    } catch (err) {
      const e = err as { statusCode?: number; body?: string; message?: string }
      const status = e.statusCode ?? null
      const body = String(e.body ?? e.message ?? '').slice(0, 300)
      result.failed++
      result.errors.push({ status, body })
      console.error(`[push] send failed for user ${userId}: status=${status} body=${body}`)
      if (status === 404 || status === 410) {
        result.removed++
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      } else {
        await supabase.from('push_subscriptions')
          .update({ last_error_at: new Date().toISOString(), last_error_status: status, last_error_body: body })
          .eq('id', sub.id)
      }
    }
  }))

  return result
}

// Summarizes Promise.allSettled(sendPushToUser(...)) for a cron route's JSON
// response: `delivered` = users with at least one device that actually
// accepted the push — the old "reminded"/"notified" counts were just users
// attempted, which hid every failure.
export function summarizePush(settled: PromiseSettledResult<PushSendResult>[]) {
  let delivered = 0
  let failedUsers = 0
  const errorStatuses: Record<string, number> = {}
  for (const r of settled) {
    if (r.status === 'rejected') { failedUsers++; errorStatuses['exception'] = (errorStatuses['exception'] ?? 0) + 1; continue }
    if (r.value.sent > 0) delivered++
    else if (r.value.failed > 0) failedUsers++
    for (const e of r.value.errors) {
      const k = String(e.status ?? 'unknown')
      errorStatuses[k] = (errorStatuses[k] ?? 0) + 1
    }
  }
  return { attempted: settled.length, delivered, failedUsers, errorStatuses }
}
