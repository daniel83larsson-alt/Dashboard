import { useEffect } from 'react'

// Esc stänger rutor/lådor (Web Interface Guidelines: dialoger ska gå att stänga
// med tangentbordet). Lyssnar bara medan rutan är öppen.
export function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, onEscape])
}
