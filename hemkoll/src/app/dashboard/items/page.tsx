import { createSupabaseServerClient } from '@/lib/supabase-server'
import ItemsManager from '@/components/ItemsManager'

export default async function ItemsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: items }, { data: events }] = await Promise.all([
    supabase.from('hemkoll_house_items').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('hemkoll_events').select('*').eq('user_id', user.id).order('event_date', { ascending: false }),
  ])

  return (
    <div className="p-4 md:p-8 max-w-2xl lg:max-w-4xl w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Objekt &amp; logg</h1>
        <p className="text-muted text-sm mt-1">Vad finns i huset, och när blev det senast åtgärdat</p>
      </div>
      <ItemsManager initialItems={items ?? []} initialEvents={events ?? []} />
    </div>
  )
}
