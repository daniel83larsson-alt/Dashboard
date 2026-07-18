'use client'

import dynamic from 'next/dynamic'
import type { DayWellness } from '@/components/WellnessCharts'

// recharts is a genuinely large dependency — no reason to ship it in the
// initial bundle for every page load when only Hälsa/Grafer actually render
// a chart. Same lazy-load pattern already used for the Leaflet maps.
const WellnessCharts = dynamic(() => import('@/components/WellnessCharts'), {
  ssr: false,
  loading: () => <div className="rounded-2xl border border-edge bg-card animate-pulse" style={{ height: 240 }} />,
})

export default function WellnessChartsLoader(props: { history: DayWellness[]; showSummary?: boolean }) {
  return <WellnessCharts {...props} />
}
