'use client'

import dynamic from 'next/dynamic'
import type { RouteResult } from '@/app/api/routes/search/route'

const RouteMap = dynamic(() => import('@/components/RouteMap'), {
  ssr: false,
  loading: () => <div className="rounded-2xl border border-edge bg-bg animate-pulse" style={{ height: 420 }} />,
})

export default function RouteMapLoader(props: {
  center: { lat: number; lng: number }
  routes: RouteResult[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  return <RouteMap {...props} />
}
