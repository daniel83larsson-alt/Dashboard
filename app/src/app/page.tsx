import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import LandingPage from '@/components/LandingPage'

export const metadata: Metadata = {
  title: 'DL Trainer — Din AI-tränare, dygnet runt',
  description: 'Samla dina pass, sömn, mat och puls på ett ställe. En AI-coach per sportgren, kopplat till Garmin, Concept2, Strava och Polar. Gratis att komma igång.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'DL Trainer — Din AI-tränare, dygnet runt',
    description: 'Samla dina pass, sömn, mat och puls på ett ställe. En AI-coach per sportgren, kopplat till Garmin, Concept2, Strava och Polar.',
    url: '/',
    siteName: 'DL Trainer',
    locale: 'sv_SE',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DL Trainer — Din AI-tränare, dygnet runt',
    description: 'Samla dina pass, sömn, mat och puls på ett ställe. En AI-coach per sportgren.',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'DL Trainer',
  applicationCategory: 'HealthApplication',
  operatingSystem: 'Web',
  description: 'AI-träningsdashboard som samlar pass, sömn, mat och puls på ett ställe, med en AI-coach per sportgren.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'SEK' },
}

export default async function Home() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Inloggade ska rakt in i appen som tidigare — bara utloggade besökare
  // möts nu av reklamsidan istället för att kastas till inloggningsrutan
  // direkt (Daniel: "bör vi ha en reklamsida... hade varit snyggt").
  if (user) redirect('/dashboard')

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LandingPage />
    </>
  )
}
