// Shown instantly (no data needed) while page.tsx's own data-fetching runs
// server-side — replaces a blank/frozen screen on cold PWA opens with
// something happening immediately. dashboard/layout.tsx sits outside this
// boundary (it does its own quick auth+name check), so nav bars still
// appear as soon as that resolves; this covers page.tsx's much heavier
// fetch specifically.
export default function DashboardLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="font-mono text-accent text-4xl font-bold tracking-tight leading-none animate-pulse">DL</div>
      <span className="w-4 h-4 border-2 border-edge border-t-accent rounded-full animate-spin" />
    </div>
  )
}
