import { createSupabaseServerClient } from '@/lib/supabase-server'
import Link from 'next/link'
import HouseProfileCard from '@/components/HouseProfileCard'
import HouseMap from '@/components/HouseMap'
import HomeyCard from '@/components/HomeyCard'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function OverviewPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: items }, { data: events }] = await Promise.all([
    supabase.from('hemkoll_house_profile').select('*').eq('user_id', user.id).single(),
    supabase.from('hemkoll_house_items').select('id').eq('user_id', user.id),
    supabase.from('hemkoll_events').select('*').eq('user_id', user.id).order('event_date', { ascending: false }).limit(8),
  ])

  const itemCount = items?.length ?? 0
  const rawExtracted = (profile?.raw_extracted ?? null) as Record<string, unknown> | null
  const lat = typeof rawExtracted?.lat === 'number' ? rawExtracted.lat : null
  const lng = typeof rawExtracted?.lng === 'number' ? rawExtracted.lng : null

  return (
    <div className="p-4 md:p-8 max-w-2xl lg:max-w-5xl w-full mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hemkoll</h1>
        <p className="text-muted text-sm mt-1">
          {itemCount > 0 ? `${itemCount} objekt loggade` : 'Inget loggat ännu — börja under Objekt & logg'}
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-3 lg:gap-6 space-y-6 lg:space-y-0">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Husprofil</h2>
            <HouseProfileCard profile={profile ?? null} />
          </div>
          {lat != null && lng != null && (
            <div>
              <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Läge</h2>
              <HouseMap lat={lat} lng={lng} address={profile?.address} />
            </div>
          )}
        </div>

        <div>
          <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Snabbval</h2>
          <div className="flex flex-col gap-2">
            <Link href="/dashboard/import" className="bg-card border border-edge rounded-xl p-3 text-sm hover:border-accent/40 transition-colors flex items-center gap-2">
              🔗 Importera
            </Link>
            <Link href="/dashboard/items" className="bg-card border border-edge rounded-xl p-3 text-sm hover:border-accent/40 transition-colors flex items-center gap-2">
              📋 Lägg till objekt
            </Link>
            <Link href="/dashboard/radgivare" className="bg-card border border-edge rounded-xl p-3 text-sm hover:border-accent/40 transition-colors flex items-center gap-2">
              💬 Fråga rådgivaren
            </Link>
          </div>

          <h2 className="text-xs text-muted uppercase tracking-wider mb-3 mt-6">Anslutna hem-system</h2>
          <HomeyCard />
        </div>
      </div>

      <div>
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Senaste händelser</h2>
        {(events ?? []).length === 0 ? (
          <div className="bg-card border border-edge rounded-2xl p-8 text-center">
            <div className="text-muted text-sm">Inga händelser loggade än</div>
          </div>
        ) : (
          <div className="bg-card border border-edge rounded-2xl divide-y divide-edge">
            {(events ?? []).map(ev => (
              <div key={ev.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{ev.title}</div>
                  <div className="text-muted text-xs mt-0.5">{fmtDate(ev.event_date)}</div>
                </div>
                {ev.cost != null && <span className="font-mono text-accent text-sm">{ev.cost} kr</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
