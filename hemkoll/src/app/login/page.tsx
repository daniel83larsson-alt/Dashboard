'use client'

import { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const supabase = createSupabaseClient()

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage('Kolla din e-post och klicka på länken för att aktivera kontot.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError('Felaktig e-post eller lösenord')
      else router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="text-4xl mb-2">🏡</div>
          <div className="text-fg text-xl font-semibold tracking-wide">Hemkoll</div>
          <div className="text-muted text-sm mt-1">Koll på huset — vad finns, vad är gjort, vad är värt att göra härnäst</div>
        </div>

        <div className="flex bg-card border border-edge rounded-xl p-1 mb-6">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'login' ? 'bg-accent text-bg' : 'text-muted'
            }`}
          >
            Logga in
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'signup' ? 'bg-accent text-bg' : 'text-muted'
            }`}
          >
            Skapa konto
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-muted text-xs uppercase tracking-wider mb-1.5 block">E-post</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="din@epost.se"
              required
              className="w-full bg-card border border-edge rounded-xl px-4 py-3 text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
            />
          </div>
          <div>
            <label className="text-muted text-xs uppercase tracking-wider mb-1.5 block">Lösenord</label>
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

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {message && <p className="text-accent text-sm">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="bg-accent text-bg font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm"
          >
            {loading ? 'Ett ögonblick...' : mode === 'signup' ? 'Skapa konto' : 'Logga in'}
          </button>
        </form>
      </div>
    </div>
  )
}
