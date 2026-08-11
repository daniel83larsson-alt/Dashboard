import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import './globals.css'

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jb' })

export const metadata: Metadata = {
  metadataBase: new URL('https://dltrainer.se'),
  title: 'DL Trainer',
  description: 'Din personliga AI-träningsdashboard',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DL Trainer',
  },
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0e1113',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full`}>
      <body className="min-h-full bg-bg text-fg antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  )
}
