'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { nextFocusIndex } from '@/lib/focus-trap'

// Gemensam ruta/låda för hela appen (tidigare fem hemmabyggda kopior). Ger:
// dialogroll, Esc stänger (bara den översta om flera är öppna), fokusfälla,
// fokus tillbaka till knappen som öppnade rutan, och stängning vid klick på
// bakgrunden (bara om klicket börjar och slutar på bakgrunden).
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
const openModals: symbol[] = []

export default function Modal({
  onClose,
  label,
  placement = 'center',
  z = 60,
  panelClassName = '',
  children,
}: {
  onClose: () => void
  label: string
  placement?: 'center' | 'bottom'
  z?: number
  panelClassName?: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    const id = Symbol('modal')
    openModals.push(id)
    const previous = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    // Fokus på rutan själv, inte första fältet: undviker att tangentbordet
    // öppnas av sig självt på telefonen, och nästa Tab hamnar på första knappen.
    panel?.focus()

    function onKey(e: KeyboardEvent) {
      if (openModals[openModals.length - 1] !== id) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null)
      const index = items.indexOf(document.activeElement as HTMLElement)
      const target = nextFocusIndex(index, items.length, e.shiftKey)
      if (target === null) return
      e.preventDefault()
      if (target === -1) panel.focus()
      else items[target].focus()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = openModals.indexOf(id)
      if (i >= 0) openModals.splice(i, 1)
      previous?.focus?.()
    }
  }, [])

  const bottom = placement === 'bottom'
  return (
    <div
      className={`fixed inset-0 bg-black/60 flex justify-center ${bottom ? 'items-end' : 'items-center p-4'}`}
      style={{ zIndex: z }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`bg-card border border-edge p-4 w-full focus:outline-none ${bottom ? 'border-b-0 rounded-t-2xl max-w-2xl overflow-y-auto' : 'rounded-2xl max-w-sm'} ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  )
}
