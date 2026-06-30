'use client'

import { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Profile = {
  id: string
  name?: string | null
  llm_api_key_encrypted?: string | null
  llm_provider?: string | null
}

export default function ProfileForm({
  profile,
  userEmail,
  hasConcept2,
}: {
  profile: Profile | null
  userEmail: string
  hasConcept2: boolean
}) {
  const [name, setName] = useState(profile?.name ?? '')
  const [apiKey, setApiKey] = useState('')
  const [provider, setProvider] = useState(profile?.llm_provider ?? 'anthropic')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const router = useRouter()

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createSupabaseClient()
    const update: Record<string, string> = { name, llm_provider: provider }
    if (apiKey.trim()) update.llm_api_key_encrypted = apiKey.trim()
    await supabase.from('profiles').update(update).eq('id', profile?.id ?? '')
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  async function syncNow() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/activities/sync', { method: 'POST' })
      const data = await res.json()
      if (data.synced !== undefined) {
        setSyncMsg(`Synkade ${data.synced} nya pass`)
        router.refresh()
      } else {
        setSyncMsg(data.error ?? 'Något gick fel')
      }
    } catch {
      setSyncMsg('Nätverksfel')
    }
    setSyncing(false)
  }

  async function signOut() {
    const supabase = createSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const hasApiKey = !!profile?.llm_api_key_encrypted

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      {/* Account */}
      <div className="bg-card border border-edge rounded-2xl p-4">
        <div className="text-xs text-muted uppercase tracking-wider mb-2">Konto</div>
        <div className="text-fg text-sm">{userEmail}</div>
      </div>

      {/* Profile */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-4">
        <div className="text-xs text-muted uppercase tracking-wider">Profil</div>
        <div>
          <label className="text-muted text-xs block mb-1.5">Namn</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Daniel Larsson"
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      {/* Concept2 */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        <div className="text-xs text-muted uppercase tracking-wider">Concept2 Logbook</div>
        {hasConcept2 ? (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm text-fg flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent inline-block" />
                Ansluten
              </div>
              {syncMsg && <div className="text-xs text-lcd mt-1">{syncMsg}</div>}
            </div>
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing}
              className="text-xs bg-bg border border-edge px-3 py-2 rounded-lg text-fg disabled:opacity-50 hover:border-accent transition-colors"
            >
              {syncing ? 'Synkar...' : 'Synka nu'}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-muted text-xs mb-3">
              Anslut Concept2 Logbook för att automatiskt synka dina roddpass.
            </p>
            <a
              href="/api/auth/concept2"
              className="inline-block bg-accent text-bg text-xs font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
            >
              Anslut Concept2
            </a>
          </div>
        )}
      </div>

      {/* AI settings */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-4">
        <div className="text-xs text-muted uppercase tracking-wider">AI-inställningar</div>
        <div>
          <label className="text-muted text-xs block mb-1.5">Leverantör</label>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-accent"
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
          </select>
        </div>
        <div>
          <label className="text-muted text-xs block mb-1.5">
            API-nyckel {hasApiKey ? '(sparat)' : '(obligatorisk för coach)'}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={hasApiKey ? '••••••••••••' : 'sk-ant-...'}
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
          />
          {!hasApiKey && (
            <p className="text-muted text-xs mt-1.5">
              Hämtas på console.anthropic.com → API Keys
            </p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-accent text-bg font-semibold py-3 rounded-xl disabled:opacity-50 transition-opacity text-sm"
      >
        {saved ? '✓ Sparat' : saving ? 'Sparar...' : 'Spara ändringar'}
      </button>

      <button
        type="button"
        onClick={signOut}
        className="text-muted text-sm py-2 hover:text-fg transition-colors"
      >
        Logga ut
      </button>
    </form>
  )
}
