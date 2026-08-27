'use client'

import { useState, useEffect } from 'react'
import { createSupabaseClient } from '@/lib/supabase'

export default function NewPasswordPage() {
  // token_hash is the new, preferred path (see STATUS.md for the real
  // incident this fixes): the recovery email links straight to THIS page
  // with a raw token_hash, verified here via verifyOtp — no PKCE
  // code_verifier needed, and crucially no hop through Supabase's own
  // hosted /verify endpoint, which is a plain single-use GET that a mail
  // scanner (Gmail's own link-prescanning, Outlook Safe Links, etc.) can —
  // and, confirmed live via the auth logs, DID — burn before the real user
  // ever clicked. `code` stays supported for links already in someone's
  // inbox from before this template change (mailer_otp_exp is 1h, so this
  // fallback is only relevant for a short window after deploy).
  const [tokenHash, setTokenHash] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Plain window.location read instead of useSearchParams — same reason
    // as login/page.tsx, avoids a Suspense boundary for a one-off param.
    const params = new URLSearchParams(window.location.search)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTokenHash(params.get('token_hash'))
    setCode(params.get('code'))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Lösenorden matchar inte')
      return
    }
    if (!tokenHash && !code) {
      setError('Länken för att återställa lösenordet var ogiltig eller har gått ut. Begär en ny.')
      return
    }
    setLoading(true)
    setError('')

    const supabase = createSupabaseClient()
    // Only ever redeemed here, on a real form submit — not on page load —
    // so a passive GET (link-scanner, prefetch, or Supabase's own /verify
    // hop for the old `code`-based links) can never burn it before the
    // person actually sets their password.
    const { error: verifyError } = tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
      : await supabase.auth.exchangeCodeForSession(code!)
    if (verifyError) {
      setError('Länken för att återställa lösenordet var ogiltig eller har gått ut. Begär en ny.')
      setLoading(false)
      return
    }

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
