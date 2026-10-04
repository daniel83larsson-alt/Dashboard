'use client'

import { useEffect } from 'react'
import { ensureSubscribedAndSynced, pushSupported } from '@/lib/push-client'

const KEY = 'dl-push-synced-at'
const EVERY_MS = 6 * 3600 * 1000

// Mounted once in the dashboard layout. When the user has already granted
// notification permission, quietly re-creates a lost subscription and
// re-syncs the endpoint with the server (at most every 6 h, or immediately
// when the browser had lost it). Never asks for permission itself.
export default function PushSelfHeal() {
  useEffect(() => {
    if (!pushSupported() || Notification.permission !== 'granted') return
    let last = 0
    try { last = Number(localStorage.getItem(KEY) ?? 0) } catch {}
    if (Date.now() - last < EVERY_MS) return
    ensureSubscribedAndSynced()
      .then(r => { if (r.ok) { try { localStorage.setItem(KEY, String(Date.now())) } catch {} } })
      .catch(() => {})
  }, [])
  return null
}
