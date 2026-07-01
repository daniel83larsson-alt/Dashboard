'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'

type Profile = {
  id: string
  email: string
  name: string | null
  created_at: string
  locked: boolean | null
  flagged_attempts: number | null
}

export default function AdminUserRow({ profile, isSelf }: { profile: Profile; isSelf: boolean }) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function toggleLock() {
    setBusy(true)
    const supabase = createSupabaseClient()
    await supabase.from('profiles').update({ locked: !profile.locked }).eq('id', profile.id)
    setBusy(false)
    router.refresh()
  }

  return (
    <div className={`bg-card border rounded-xl p-4 ${profile.locked ? 'border-red-500/40' : 'border-edge'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-fg truncate">
            {profile.name || profile.email}
            {isSelf && <span className="text-muted text-xs ml-2">(du)</span>}
          </div>
          <div className="text-muted text-xs mt-0.5 truncate">{profile.email}</div>
          <div className="text-muted text-[11px] mt-1">
            Registrerad {new Date(profile.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          {(profile.flagged_attempts ?? 0) > 0 && (
            <div className="text-amber-400 text-[11px] mt-1">{profile.flagged_attempts} flaggade chattmeddelanden</div>
          )}
        </div>
        {!isSelf && (
          <button
            onClick={toggleLock}
            disabled={busy}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium flex-shrink-0 disabled:opacity-50 ${
              profile.locked
                ? 'bg-accent/10 text-accent border border-accent/30'
                : 'bg-bg text-muted border border-edge hover:border-red-500/40 hover:text-red-400'
            }`}
          >
            {busy ? '...' : profile.locked ? 'Lås upp' : 'Lås konto'}
          </button>
        )}
      </div>
    </div>
  )
}
