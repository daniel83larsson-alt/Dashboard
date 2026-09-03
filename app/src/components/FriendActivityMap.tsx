'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const ActivityMap = dynamic(() => import('@/components/ActivityMap'), {
  ssr: false,
  loading: () => <div className="rounded-2xl border border-edge bg-bg animate-pulse" style={{ height: 220 }} />,
})

type RouteData = { lat: number | null; lng: number | null; polyline: [number, number][] | null }

// Fetched only when a friend's row is actually expanded — never as part of
// the feed itself, since most passes won't have a cached route and the
// feed shouldn't pay for that lookup on every load.
export default function FriendActivityMap({ activityId, label }: { activityId: string; label: string }) {
  const [data, setData] = useState<RouteData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/activities/${activityId}/friend-route`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData({ lat: null, lng: null, polyline: null }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activityId])

  if (loading) {
    return <div className="rounded-2xl border border-edge bg-bg animate-pulse" style={{ height: 180 }} />
  }

  if (data?.lat == null || data?.lng == null) {
    return (
      <div className="text-center text-muted text-xs py-6 bg-bg rounded-2xl border border-edge">
        Ingen kartdata tillgänglig för det här passet
      </div>
    )
  }

  return <ActivityMap lat={data.lat} lng={data.lng} label={label} polyline={data.polyline} />
}
