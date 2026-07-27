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

function fmtLastSynced(iso: string | null) {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'idag'
  if (days === 1) return 'igår'
  if (days < 30) return `${days} dagar sedan`
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Three states, not two: "–" (aldrig anslutet) is different from "◐" (uppgifter
// sparade men inget synkat än) which is different from "✓" (faktiskt synkat
// minst ett pass). Ett grönt bock ska bara betyda att det bevisligen fungerar.
function syncBadge(connected: boolean, synced: boolean, label: string) {
  if (synced) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded border text-accent border-accent/30 bg-accent/10">✓ {label}</span>
  }
  if (connected) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded border text-amber-400 border-amber-400/30 bg-amber-400/10">◐ {label}</span>
  }
  return <span className="text-[10px] px-1.5 py-0.5 rounded border text-muted border-edge">– {label}</span>
}

export default function AdminUserRow({
  profile,
  isSelf,
  hasConcept2,
  hasGarmin,
  concept2Synced,
  garminSynced,
  activityCount,
  daysSynced,
  lastSynced,
  callsToday,
  calls7d,
}: {
  profile: Profile
  isSelf: boolean
  hasConcept2: boolean
  hasGarmin: boolean
  concept2Synced: boolean
  garminSynced: boolean
  activityCount: number
  daysSynced: number
  lastSynced: string | null
  callsToday: number
  calls7d: number
}) {
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const router = useRouter()

  async function toggleLock() {
    setBusy(true)
    const supabase = createSupabaseClient()
    await supabase.from('profiles').update({ locked: !profile.locked }).eq('id', profile.id)
    setBusy(false)
    router.refresh()
  }

  async function testGarmin() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/test-garmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: profile.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setTestResult(`⚠ ${data.error ?? 'Något gick fel'}`)
      } else if (data.ok) {
        const latest = data.preview?.[0]
        setTestResult(`✓ Inloggning fungerar — hittade ${data.count} pass${latest ? `, senaste: ${latest.name} (${new Date(latest.startTimeLocal).toLocaleDateString('sv-SE')})` : ''}`)
      } else if (data.reason === 'not_configured') {
        setTestResult('– Ingen Garmin-koppling sparad för den här användaren')
      } else if (data.reason === 'login_failed') {
        setTestResult('⚠ Inloggningen mot Garmin misslyckas — troligen fel lösenord eller att Garmin kräver ny verifiering')
      } else {
        setTestResult(`⚠ ${data.reason ?? 'Okänt fel'}`)
      }
    } catch {
      setTestResult('⚠ Nätverksfel')
    }
    setTesting(false)
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
          <div className="flex gap-1.5 mt-2">
            {syncBadge(hasConcept2, concept2Synced, 'Concept2')}
            {syncBadge(hasGarmin, garminSynced, 'Garmin')}
          </div>
          <div className="text-muted text-[11px] mt-1.5">
            {activityCount > 0
              ? `${activityCount} pass · ${daysSynced} dagar · senast synkat ${fmtLastSynced(lastSynced)}`
              : (hasConcept2 || hasGarmin) ? 'Anslutet men inget synkat än' : 'Inget synkat ännu'}
          </div>
          {(callsToday > 0 || calls7d > 0) && (
            <div className={`text-[11px] mt-1 ${callsToday >= 20 ? 'text-amber-400' : 'text-muted'}`}>
              {callsToday} anrop idag · {calls7d} senaste 7 dagarna
              {callsToday >= 20 && ' — ovanligt högt'}
            </div>
          )}
          {hasGarmin && (
            <div className="mt-2">
              <button
                onClick={testGarmin}
                disabled={testing}
                className="text-[11px] px-2 py-1 rounded-md border border-edge text-muted hover:border-accent/40 hover:text-fg disabled:opacity-50"
              >
                {testing ? 'Testar...' : 'Testa Garmin-synk'}
              </button>
              {testResult && <div className="text-[11px] mt-1.5 text-fg">{testResult}</div>}
            </div>
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
