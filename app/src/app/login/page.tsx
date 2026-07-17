'use client'

import { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function tryDemo() {
    const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL
    const demoPassword = process.env.NEXT_PUBLIC_DEMO_PASSWORD
    if (!demoEmail || !demoPassword) return
    setLoading(true)
    setError('')
    const supabase = createSupabaseClient()
    const { error } = await supabase.auth.signInWithPassword({ email: demoEmail, password: demoPassword })
    if (error) {
      setError('Demo-kontot är tillfälligt otillgängligt, försök igen om en stund.')
      setLoading(false)
    } else {
      window.location.href = '/dashboard'
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const supabase = createSupabaseClient()

    if (mode === 'signup') {
      // Always the real app's canonical URL, never window.location.origin —
      // a signup started from a Vercel preview/branch URL (bookmarked,
      // shared by mistake, or just left open in a tab) must still send the
      // confirmation link back to the one real production site, not
      // whichever preview deployment happened to render the signup form.
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
        },
      })
      if (error) setError(error.message)
      else setMessage('Kolla din e-post och klicka på länken för att aktivera kontot.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('Felaktig e-post eller lösenord')
      } else {
        // Hard navigation, not router.push — Supabase's browser client sets
        // the session cookie directly via document.cookie, which Next.js's
        // client-side route cache has no way to know about. A client-side
        // push can therefore reuse a PREVIOUS user's cached page/layout
        // (e.g. the last person who used this browser) until a real reload
        // happens. Auth transitions always get a full reload.
        window.location.href = '/dashboard'
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="font-mono text-accent text-4xl font-bold tracking-tight leading-none">DL</div>
          <div className="text-fg text-xl font-semibold tracking-wide mt-1">Trainer</div>
          <div className="text-muted text-sm mt-1">Din personliga AI-träningsdashboard</div>
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
          {mode === 'signup' && (
            <div>
              <label className="text-muted text-xs uppercase tracking-wider mb-1.5 block">Namn</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="För- och efternamn"
                required
                className="w-full bg-card border border-edge rounded-xl px-4 py-3 text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors text-sm"
              />
            </div>
          )}
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
          {message && <p className="text-lcd text-sm">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-bg font-semibold py-3 rounded-xl mt-2 disabled:opacity-50 transition-opacity text-sm"
          >
            {loading ? '...' : mode === 'login' ? 'Logga in' : 'Skapa konto'}
          </button>
        </form>

        {process.env.NEXT_PUBLIC_DEMO_EMAIL && (
          <button
            onClick={tryDemo}
            disabled={loading}
            className="w-full bg-card border border-edge text-fg font-medium py-3 rounded-xl mt-3 disabled:opacity-50 hover:border-accent transition-colors text-sm"
          >
            🔍 Prova demo (ingen inloggning behövs)
          </button>
        )}
      </div>
    </div>
  )
}
