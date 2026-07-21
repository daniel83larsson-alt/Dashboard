export default function WeeklyDigestBadge({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <a
      href="/dashboard/veckoplan"
      className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-card border border-edge hover:border-accent/40 transition-colors flex-shrink-0"
      title="Veckans Recap är redo"
    >
      <span className="text-base">📋</span>
      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-accent border-2 border-bg" />
    </a>
  )
}
