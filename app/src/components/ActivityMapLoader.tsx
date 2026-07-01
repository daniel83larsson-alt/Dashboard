'use client'

import dynamic from 'next/dynamic'

const ActivityMap = dynamic(() => import('@/components/ActivityMap'), {
  ssr: false,
  loading: () => <div className="rounded-2xl border border-edge bg-bg animate-pulse" style={{ height: 220 }} />,
})

export default function ActivityMapLoader(props: { lat: number; lng: number; label: string }) {
  return <ActivityMap {...props} />
}
