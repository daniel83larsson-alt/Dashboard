'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SYNC_STORAGE_KEY, MIN_SYNC_INTERVAL_MS } from '@/lib/sync'

// Silently syncs Concept2 + Garmin once per browser per interval, triggered
// on dashboard load (i.e. effectively "on login"). Renders nothing.
export default function AutoSync() {
  const router = useRouter()

  useEffect(() => {
    const last = Number(localStorage.getItem(SYNC_STORAGE_KEY) ?? 0)
    if (Date.now() - last < MIN_SYNC_INTERVAL_MS) return

    localStorage.setItem(SYNC_STORAGE_KEY, String(Date.now()))
    Promise.allSettled([
      fetch('/api/activities/sync', { method: 'POST' }),
      fetch('/api/activities/sync-garmin', { method: 'POST' }),
    ]).then(() => router.refresh())
  }, [router])

  return null
}
