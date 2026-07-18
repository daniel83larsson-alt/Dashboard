'use client'

import dynamic from 'next/dynamic'

type Activity = {
  start_date: string
  distance: number
  moving_time: number
  average_heartrate?: number | null
  sport_type: string
}

// SportChartsTabs pulls in TrainingCharts (recharts) internally — lazy-
// loading this one wrapper covers both, same reasoning as the maps and
// WellnessChartsLoader.
const SportChartsTabs = dynamic(() => import('@/components/SportChartsTabs'), {
  ssr: false,
  loading: () => <div className="rounded-2xl border border-edge bg-card animate-pulse" style={{ height: 320 }} />,
})

export default function SportChartsTabsLoader({ activities }: { activities: Activity[] }) {
  return <SportChartsTabs activities={activities} />
}
