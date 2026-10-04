// Browser-side helpers for web push, shared by the settings card and the
// background self-heal (components/PushSelfHeal.tsx).

// Standard VAPID applicationServerKey conversion (browsers want a raw
// Uint8Array, the key is handed out as URL-safe base64).
export function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Safe)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0))).buffer as ArrayBuffer
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
}

// Makes sure this browser has a push subscription AND that the server knows
// about it. Only call when permission is already 'granted' (no prompt) or
// from a user gesture. Returns whether the server accepted it.
//
// iOS drops or rotates web-push subscriptions silently (app updates,
// reinstall, expiry). The server keeps the old endpoint and the settings
// toggle "turns itself off" — re-subscribing and re-sending the endpoint on
// every app start is what keeps the two in sync.
export async function ensureSubscribedAndSynced(): Promise<{ ok: boolean; resubscribed: boolean }> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey || !pushSupported()) return { ok: false, resubscribed: false }
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  let resubscribed = false
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
    resubscribed = true
  }
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  })
  return { ok: res.ok, resubscribed }
}
