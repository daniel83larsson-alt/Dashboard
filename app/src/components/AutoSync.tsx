'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SYNC_STORAGE_KEY, MIN_SYNC_INTERVAL_MS } from '@/lib/sync'

const CATCHUP_DELAY_MS = 3 * 60 * 1000 // 3 min between backfill rounds
const CATCHUP_MAX_ROUNDS = 20 // 20 × 20 days ≈ covers a full year

// Silently syncs Concept2 + Garmin once per browser per interval, triggered
// on dashboard load (i.e. effectively "on login"). If Garmin wellness
// history or the older pass history still has gaps (e.g. a brand new user
// with a year to backfill), schedules additional Garmin-only catch-up
// rounds a few minutes apart while the tab stays open, instead of
// hammering Garmin's API all at once.
function needsMoreCatchup(data: { remainingGaps?: number; activitiesBackfillDone?: boolean; zonesRemaining?: number } | undefined): boolean {
  if (!data) return false
  return (data.remainingGaps ?? 0) > 0 || data.activitiesBackfillDone === false || (data.zonesRemaining ?? 0) > 0
}

export default function AutoSync() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    function scheduleCatchup(round: number) {
      if (cancelled || round >= CATCHUP_MAX_ROUNDS) return
      timeoutId = setTimeout(async () => {
        if (cancelled) return
        try {
          const res = await fetch('/api/activities/sync-garmin', { method: 'POST' })
          const data = await res.json()
          if (!cancelled) router.refresh()
          if (!cancelled && needsMoreCatchup(data)) scheduleCatchup(round + 1)
        } catch {
          // Network hiccup — next normal sync (or next tab visit) will retry
        }
      }, CATCHUP_DELAY_MS)
    }

    const last = Number(localStorage.getItem(SYNC_STORAGE_KEY) ?? 0)
    if (Date.now() - last < MIN_SYNC_INTERVAL_MS) return

    localStorage.setItem(SYNC_STORAGE_KEY, String(Date.now()))
    Promise.allSettled([
      fetch('/api/activities/sync', { method: 'POST' }),
      fetch('/api/activities/sync-garmin', { method: 'POST' }).then(r => r.json()),
    ]).then(([, garminResult]) => {
      if (cancelled) return
      router.refresh()
      const data = garminResult.status === 'fulfilled' ? garminResult.value : undefined
      if (needsMoreCatchup(data)) scheduleCatchup(1)
    })

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [router])

  return null
}
