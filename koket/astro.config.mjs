import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://koket-nycklar.vercel.app',
  output: 'static',
  integrations: [
    sitemap({
      // /inkopslista/ har noindex (Fas 4-platshållare) — ska inte i sitemapen.
      filter: (page) => !page.includes('/inkopslista/'),
    }),
  ],
  image: {
    // Local (self-hosted) images only — no remote hotlinking in the rebuild.
    domains: [],
  },
});
