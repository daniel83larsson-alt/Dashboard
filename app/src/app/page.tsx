import type { Metadata } from 'next'
import LandingPage, { FAQ } from '@/components/LandingPage'

export const metadata: Metadata = {
  title: 'DL Trainer: AI-coach för träning, mat och sömn',
  description: 'Samla pass, puls, sömn och kalorier från Garmin, Concept2, Strava, Polar och YAZIO. En AI-coach som läser av din vecka. Gratis att börja.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'DL Trainer: AI-coach för träning, mat och sömn',
    description: 'Samla pass, puls, sömn och kalorier från Garmin, Concept2, Strava, Polar och YAZIO. En AI-coach som läser av din vecka.',
    url: 'https://dltrainer.se/',
    siteName: 'DL Trainer',
    locale: 'sv_SE',
    type: 'website',
    // Explicit absolute URL — Next's automatic file-convention pickup of
    // opengraph-image.tsx ignores metadataBase and falls back to
    // VERCEL_BRANCH_URL/VERCEL_URL whenever VERCEL_ENV=preview, which is
    // what the production deployment was serving.
    images: ['https://dltrainer.se/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DL Trainer: AI-coach för träning, mat och sömn',
    description: 'Samla dina pass, sömn, mat och puls på ett ställe. En AI-coach per sportgren.',
    images: ['https://dltrainer.se/opengraph-image'],
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

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
}

// Statisk sida (inga cookies/headers läses här): inloggade omdirigeras av proxy.ts innan sidan
// serveras, så besökare och robotar får en cachad sida i stället för en ny server-rendering.
export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <LandingPage />
    </>
  )
}
