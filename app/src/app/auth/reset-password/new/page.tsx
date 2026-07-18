'use client'

import { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'

export default function NewPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Lösenorden matchar inte')
      return
    }
    setLoading(true)
    setError('')

    const supabase = createSupabaseClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('Kunde inte uppdatera lösenordet. Länken kan ha gått ut — försök begära en ny.')
      setLoading(false)
      return
    }
    setDone(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="font-mono text-accent text-4xl font-bold tracking-tight leading-none">DL</div>
          <div className="text-fg text-xl font-semibold tracking-wide mt-1">Trainer</div>
          <div className="text-muted text-sm mt-1">Sätt ett nytt lösenord</div>
        </div>

        {done ? (
          <div className="bg-card border border-edge rounded-2xl p-5 text-center">
            <div className="text-fg text-sm mb-4">Lösenordet är uppdaterat.</div>
            <a
              href="/dashboard"
              className="inline-block w-full bg-accent text-bg font-semibold py-3 rounded-xl text-sm"
            >
              Fortsätt till appen
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-muted text-xs uppercase tracking-wider mb-1.5 block">Nytt lösenord</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full bg-card border border-edge rounded-xl px-4 py-3 text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
              />
            </div>
            <div>
              <label className="text-muted text-xs uppercase tracking-wider mb-1.5 block">Bekräfta lösenord</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full bg-card border border-edge rounded-xl px-4 py-3 text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-bg font-semibold py-3 rounded-xl mt-2 disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed transition-opacity text-sm"
            >
              {loading ? '...' : 'Spara nytt lösenord'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
