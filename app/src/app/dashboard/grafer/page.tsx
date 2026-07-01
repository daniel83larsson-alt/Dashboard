import { createSupabaseServerClient } from '@/lib/supabase-server'
import SportChartsTabs from '@/components/SportChartsTabs'

export default async function GraferPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: activities } = await supabase
    .from('activities')
    .select('start_date, distance, moving_time, average_heartrate, sport_type')
    .eq('user_id', user.id)
    .order('start_date', { ascending: false })
    .limit(200)

  return (
    <div className="p-4 md:p-8 max-w-2xl lg:max-w-5xl w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Grafer</h1>
        <p className="text-muted text-sm mt-1">Trender, pace och volym</p>
      </div>
      <SportChartsTabs activities={activities ?? []} />
    </div>
  )
}
