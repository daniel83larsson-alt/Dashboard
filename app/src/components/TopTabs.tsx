'use client'

import { useState, type ReactNode } from 'react'

type Tab = { key: string; label: string }

// Generic top-level tab switcher for pages that merge what used to be
// several separate routes (e.g. Hälsa/Grafer/Insikter, Logga pass/Rörlighet)
// — all panels are fetched server-side up front and passed in already
// rendered, this only toggles which one is visible, so switching tabs never
// re-fetches or loses a panel's own internal state (e.g. ZoneTabs' own
// selection).
export default function TopTabs({ tabs, initial, children }: { tabs: Tab[]; initial?: string; children: Record<string, ReactNode> }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key)

  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-edge overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              active === t.key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map(t => (
        <div key={t.key} style={{ display: active === t.key ? 'block' : 'none' }}>
          {children[t.key]}
        </div>
      ))}
    </div>
  )
}
