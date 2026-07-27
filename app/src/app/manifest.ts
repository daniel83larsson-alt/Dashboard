import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DL Trainer',
    short_name: 'DL Trainer',
    description: 'Din personliga AI-träningsdashboard',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0e1113',
    theme_color: '#0e1113',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
