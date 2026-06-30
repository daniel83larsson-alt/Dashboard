'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SYNC_STORAGE_KEY } from '@/lib/sync'

export default function SyncAllButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function syncAll() {
    setLoading(true)
    try {
      await Promise.allSettled([
        fetch('/api/activities/sync', { method: 'POST' }),
        fetch('/api/activities/sync-garmin', { method: 'POST' }),
      ])
      localStorage.setItem(SYNC_STORAGE_KEY, String(Date.now()))
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={syncAll}
      disabled={loading}
      className="bg-card border border-edge text-xs text-fg px-3 py-2 rounded-xl disabled:opacity-50 hover:border-accent/40 transition-colors flex items-center gap-2 flex-shrink-0"
    >
      {loading ? (
        <>
          <span className="w-3 h-3 border-2 border-muted/40 border-t-fg rounded-full animate-spin" />
          Synkar…
        </>
      ) : (
        <>↻ Synka allt</>
      )}
    </button>
  )
}
