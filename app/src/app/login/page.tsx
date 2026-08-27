'use client'

import { useState, useEffect } from 'react'
import { createSupabaseClient } from '@/lib/supabase'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Plain window.location read instead of useSearchParams — this page is
    // statically rendered and useSearchParams would force a Suspense
    // boundary just for a one-off error flag from the reset-password link
    // (and now the landing page's "Skapa konto" link).
    const params = new URLSearchParams(window.location.search)
    if (params.get('resetError')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('Länken för att återställa lösenordet var ogiltig eller har gått ut. Begär en ny.')
    }
    if (params.get('mode') === 'signup') {
      setMode('signup')
    }
  }, [])

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

    if (mode === 'forgot') {
      // Not supabase.auth.resetPasswordForEmail() — that sends Supabase's
      // own built-in recovery email, whose link is a plain single-use GET
      // to Supabase's hosted /verify endpoint. A mail prescanner (Gmail's
      // own link-scanning, confirmed live via the auth logs) can burn that
      // link before the real person ever clicks it. This route generates
      // the link itself and sends it through our own email pipeline
      // instead — see api/auth/forgot-password/route.ts for the full
      // story. Always shows the same message regardless of outcome (route
      // enforces this server-side too) so the form can't be used to check
      // which emails have an account.
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }).catch(() => {})
      setMessage('Om det finns ett konto med den e-postadressen har vi skickat en länk för att återställa lösenordet.')
      setLoading(false)
      return
    }

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

        {mode === 'forgot' ? (
          <button
            onClick={() => { setMode('login'); setError(''); setMessage('') }}
            className="text-muted text-sm mb-6 hover:text-fg transition-colors"
          >
            ‹ Tillbaka till inloggning
          </button>
        ) : (
          <div className="flex bg-card border border-edge rounded-xl p-1 mb-6">
            <button
              onClick={() => { setMode('login'); setError(''); setMessage('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'login' ? 'bg-accent text-bg' : 'text-muted'
              }`}
            >
              Logga in
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); setMessage('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'signup' ? 'bg-accent text-bg' : 'text-muted'
              }`}
            >
              Skapa konto
            </button>
          </div>
        )}

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
          {mode !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-muted text-xs uppercase tracking-wider block">Lösenord</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); setMessage('') }}
                    className="text-accent text-xs hover:underline"
                  >
                    Glömt lösenord?
                  </button>
                )}
              </div>
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
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {message && <p className="text-lcd text-sm">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-bg font-semibold py-3 rounded-xl mt-2 disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed transition-opacity text-sm"
          >
            {loading ? '...' : mode === 'login' ? 'Logga in' : mode === 'signup' ? 'Skapa konto' : 'Skicka återställningslänk'}
          </button>
        </form>

        {mode !== 'forgot' && process.env.NEXT_PUBLIC_DEMO_EMAIL && (
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
