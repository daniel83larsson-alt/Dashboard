import { createSupabaseServerClient } from '@/lib/supabase-server'
import LoggaPassForm from '@/components/LoggaPassForm'
import RorlighetPanel from '@/components/RorlighetPanel'
import TopTabs from '@/components/TopTabs'

export default async function LoggaPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: initialTab } = await searchParams
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('profiles').select('weight_kg').eq('id', user.id).single()

  return (
    <div className="p-4 md:p-8 max-w-2xl w-full mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Logga pass</h1>
      </div>
      <TopTabs
        tabs={[
          { key: 'traning', label: 'Träningspass' },
          { key: 'rorlighet', label: 'Rörlighet' },
        ]}
        initial={initialTab && ['traning', 'rorlighet'].includes(initialTab) ? initialTab : undefined}
      >
        {{
          traning: <LoggaPassForm weightKg={profile?.weight_kg ?? null} />,
          rorlighet: <RorlighetPanel />,
        }}
      </TopTabs>
    </div>
  )
}
