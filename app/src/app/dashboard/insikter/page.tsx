import { createSupabaseServerClient } from '@/lib/supabase-server'
import InsightsPanel from '@/components/InsightsPanel'
import WellnessCharts from '@/components/WellnessCharts'
import ZoneBar from '@/components/ZoneBar'
import { aggregateZones, zoneCoverageCount } from '@/lib/zones'

export default async function InsikterPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString()

  const [{ data: insightRow }, { data: wellnessRow }, { count: activityCount }, { data: yearActivities }] = await Promise.all([
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'insights').single(),
    supabase.from('coach_sessions').select('messages').eq('user_id', user.id).eq('coach_id', 'garmin_wellness').single(),
    supabase.from('activities').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('activities').select('start_date, raw_data').eq('user_id', user.id).gte('start_date', startOfYear),
  ])

  const insightRaw = (insightRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const savedInsight = insightRaw ? (() => { try { return JSON.parse(insightRaw) } catch { return null } })() : null

  const wellnessRaw = (wellnessRow?.messages as Array<{ role: string; content: string }> | null)?.[0]?.content
  const wellnessStore = wellnessRaw ? (() => { try { return JSON.parse(wellnessRaw) } catch { return null } })() : null
  const wellnessHistory = wellnessStore?.history ?? []

  const yearRows = yearActivities ?? []
  const monthRows = yearRows.filter(a => a.start_date >= startOfMonth)
  const monthZones = aggregateZones(monthRows)
  const yearZones = aggregateZones(yearRows)

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

      {(monthZones.length > 0 || yearZones.length > 0) && (
        <div>
          <h2 className="text-xs text-muted uppercase tracking-wider mb-4">Pulszoner</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {monthZones.length > 0 && (
              <div className="bg-card border border-edge rounded-2xl p-4">
                <div className="text-xs text-muted mb-3">Denna månad · {zoneCoverageCount(monthRows)} av {monthRows.length} pass</div>
                <ZoneBar zones={monthZones} />
              </div>
            )}
            {yearZones.length > 0 && (
              <div className="bg-card border border-edge rounded-2xl p-4">
                <div className="text-xs text-muted mb-3">{now.getFullYear()} · {zoneCoverageCount(yearRows)} av {yearRows.length} pass</div>
                <ZoneBar zones={yearZones} />
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xs text-muted uppercase tracking-wider mb-4">Tränarteamets analys</h2>
        <InsightsPanel savedInsight={savedInsight} activityCount={activityCount ?? 0} hasWellness={wellnessHistory.length > 0} />
      </div>
    </div>
  )
}
