// The shared public demo login ("Prova demo" on /login) — anyone can sign
// into it without an invite, so it must never be able to touch real
// credentials, spend the shared AI quota, or collect push subscriptions
// across whoever's currently browsing it. Read/browse-only by design;
// everything else in the app stays open since worst case it's just fake
// data getting messier until the next admin reset.
export function isDemoAccount(email: string | null | undefined): boolean {
  return !!process.env.NEXT_PUBLIC_DEMO_EMAIL && email === process.env.NEXT_PUBLIC_DEMO_EMAIL
}

export const DEMO_BLOCKED_MESSAGE = 'Det här är demo-kontot — skapa ett eget konto för att använda den här funktionen.'
