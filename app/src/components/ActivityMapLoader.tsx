'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const ActivityMap = dynamic(() => import('@/components/ActivityMap'), {
  ssr: false,
  loading: () => <div className="rounded-2xl border border-edge bg-bg animate-pulse" style={{ height: 220 }} />,
})

export default function ActivityMapLoader({ lat, lng, label, activityId }: { lat: number; lng: number; label: string; activityId?: string }) {
  const [polyline, setPolyline] = useState<[number, number][] | null>(null)

  useEffect(() => {
    if (!activityId) return
    let cancelled = false
    fetch(`/api/activities/${activityId}/garmin-route`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setPolyline(data.polyline ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activityId])

  return <ActivityMap lat={lat} lng={lng} label={label} polyline={polyline} />
}
