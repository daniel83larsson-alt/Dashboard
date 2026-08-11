import type { MetadataRoute } from 'next'

// Bara startsidan är faktiskt värd att indexera — /login har inget eget
// innehåll att ranka på, och allt annat kräver inloggning.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://dltrainer.se',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
