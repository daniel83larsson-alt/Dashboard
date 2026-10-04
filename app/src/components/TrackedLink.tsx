'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import { trackEvent } from '@/components/AnalyticsClient'

// <Link> som räknar ett klick som anonym händelse (se AnalyticsClient.tsx).
export default function TrackedLink({ event, where, onClick, ...props }: ComponentProps<typeof Link> & { event: 'signup_click' | 'demo_click'; where: string }) {
  return <Link {...props} onClick={e => { trackEvent(event, where); onClick?.(e) }} />
}
