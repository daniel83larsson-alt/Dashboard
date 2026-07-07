export default function FriendRequestBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <a
      href="/dashboard/profil"
      className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-card border border-edge hover:border-accent/40 transition-colors flex-shrink-0"
      title={count === 1 ? 'Väntande vänförfrågan' : 'Väntande vänförfrågningar'}
    >
      <span className="text-base">🔔</span>
      <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
        {count}
      </span>
    </a>
  )
}
