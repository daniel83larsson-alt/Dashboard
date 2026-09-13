'use client'

import dynamic from 'next/dynamic'
import type { TrainingKcalTrendPoint } from '@/lib/training-load-trend'

// Same reasoning as WellnessChartsLoader — recharts only needed when the
// Insikter tab is actually open, not on every dashboard page load.
const TrainingLoadTrendChart = dynamic(() => import('@/components/TrainingLoadTrendChart'), {
  ssr: false,
  loading: () => <div className="rounded-2xl border border-edge bg-card animate-pulse" style={{ height: 200 }} />,
})

export default function TrainingLoadTrendChartLoader(props: { points: TrainingKcalTrendPoint[] }) {
  return <TrainingLoadTrendChart {...props} />
}
