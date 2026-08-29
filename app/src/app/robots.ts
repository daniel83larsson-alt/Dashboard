import type { MetadataRoute } from 'next'

// Enda publika sidan är startsidan (för utloggade) och inloggningen — allt
// bakom /dashboard kräver auth ändå, så det finns inget att indexera där.
// Att låta crawlers gå in där bara slösar deras crawl-budget på 307:or till
// /login.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/login'],
      disallow: ['/dashboard', '/api', '/auth'],
    },
    sitemap: 'https://dltrainer.se/sitemap.xml',
  }
}
