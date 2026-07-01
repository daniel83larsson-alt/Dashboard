import { createSupabaseServerClient } from '@/lib/supabase-server'
import InsightsPanel from '@/components/InsightsPanel'
import WellnessCharts from '@/components/WellnessCharts'
import ZoneTabs from '@/components/ZoneTabs'
import { aggregateZones, zoneCoverageCount } from '@/lib/zones'
import { startOfWeek } from '@/lib/dates'

export default async function InsikterPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now = new Date()
  const weekStart = startOfWeek(now)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const yearStart = new Date(now.getFullYear(), 0, 1)
  // Query from the earliest of the three boundaries (weekStart can fall
  // into the previous year around Jan 1) and filter the rest client-side.
  const queryStart = weekStart < yearStart ? weekStart : yearStart

  const [{ data: insightRow }, { data: wellnessRow }, { count: activityCount }, { data: rangeActivities }] = await Promise.all([
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'insights').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_wellness').single(),
    supabase.from('activities').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('activities').select('start_date, raw_data').eq('user_id', user.id).gte('start_date', queryStart.toISOString()),
  ])

  const insightRaw = (insightRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const savedInsight = insightRaw ? (() => { try { return JSON.parse(insightRaw) } catch { return null } })() : null

  const wellnessRaw = (wellnessRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const wellnessStore = wellnessRaw ? (() => { try { return JSON.parse(wellnessRaw) } catch { return null } })() : null
  const wellnessHistory = wellnessStore?.history ?? []

  const allRangeRows = rangeActivities ?? []
  const weekRows = allRangeRows.filter(a => a.start_date >= weekStart.toISOString())
  const monthRows = allRangeRows.filter(a => a.start_date >= monthStart.toISOString())
  const yearRows = allRangeRows.filter(a => a.start_date >= yearStart.toISOString())

  const zonePeriods = [
    { key: 'week', label: 'Vecka', zones: aggregateZones(weekRows), analyzed: zoneCoverageCount(weekRows), total: weekRows.length },
    { key: 'month', label: 'Månad', zones: aggregateZones(monthRows), analyzed: zoneCoverageCount(monthRows), total: monthRows.length },
    { key: 'year', label: String(now.getFullYear()), zones: aggregateZones(yearRows), analyzed: zoneCoverageCount(yearRows), total: yearRows.length },
  ]
  const hasAnyZoneData = zonePeriods.some(p => p.zones.length > 0)

  return (
    <div className="p-4 md:p-8 max-w-2xl lg:max-w-5xl w-full space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Insikter</h1>
        <p className="text-muted text-sm mt-1">Hela tränarteamet analyserar din träning</p>
      </div>

      {wellnessHistory.length > 0 && (
        <div>
          <h2 className="text-xs text-muted uppercase tracking-wider mb-4">Wellness · {wellnessHistory.length} dagar</h2>
          <WellnessCharts history={wellnessHistory} />
        </div>
      )}

      {hasAnyZoneData && (
        <div>
          <h2 className="text-xs text-muted uppercase tracking-wider mb-4">Pulszoner</h2>
          <ZoneTabs periods={zonePeriods} />
        </div>
      )}

      <div>
        <h2 className="text-xs text-muted uppercase tracking-wider mb-4">Tränarteamets analys</h2>
        <InsightsPanel savedInsight={savedInsight} activityCount={activityCount ?? 0} hasWellness={wellnessHistory.length > 0} />
      </div>
    </div>
  )
}
