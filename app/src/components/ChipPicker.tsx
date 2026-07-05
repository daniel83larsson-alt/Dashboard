'use client'

import { useState } from 'react'

// Common options as toggle chips — plus a free-text "annat" field for
// anything not listed, so the coach team can ground equipment-specific
// tips (e.g. Styrkecoach, Roddcoach) in what's actually available instead
// of guessing (Daniel: Jonas fick ett förslag om roddmaskin han inte har).
export const COMMON_EQUIPMENT = ['Roddmaskin (Concept2)', 'Motionscykel/trainer', 'Löpband', 'Kettlebell', 'Skivstång & vikter', 'Hantlar', 'Motionsband', 'TRX/ringar', 'Yogamatta', 'Simbassäng tillgänglig']
export const COMMON_SPORTS = ['Rodd', 'Löpning', 'Cykling', 'Simning', 'Styrketräning', 'Yoga', 'Vandring', 'Längdskidor', 'Lagsport', 'Klättring']

export function ChipPicker({ label, options, selected, onToggle, onAddCustom }: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
  onAddCustom: (value: string) => void
}) {
  const [custom, setCustom] = useState('')
  const extra = selected.filter(s => !options.includes(s))

  return (
    <div>
      <label className="text-muted text-xs block mb-2">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {[...options, ...extra].map(opt => {
          const active = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                active ? 'bg-accent text-bg border-accent font-medium' : 'bg-bg border-edge text-muted hover:border-accent/40'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
      <div className="flex gap-2">
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (custom.trim()) { onAddCustom(custom.trim()); setCustom('') }
            }
          }}
          placeholder="Lägg till eget..."
          className="flex-1 bg-bg border border-edge rounded-lg px-3 py-1.5 text-xs text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
        />
        <button
          type="button"
          onClick={() => { if (custom.trim()) { onAddCustom(custom.trim()); setCustom('') } }}
          className="text-xs bg-bg border border-edge px-3 py-1.5 rounded-lg text-fg hover:border-accent transition-colors"
        >
          Lägg till
        </button>
      </div>
    </div>
  )
}
