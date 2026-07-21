const PATHS: Record<string, string> = {
  home: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  log: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  insight: 'M12 16v-4M12 8h.01',
  heart: 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z',
  chart: '',
  chat: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  profile: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 18L18 6M6 6l12 12',
  admin: 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z',
  stretch: 'M12 2v6M9 5l3 3 3-3M12 22v-6M9 19l3-3 3 3M2 12h6M5 9l-3 3 3 3M16 12h6M19 9l3 3-3 3',
  trophy: 'M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4zM7 5H4v2a3 3 0 003 3M17 5h3v2a3 3 0 01-3 3',
  route: 'M5 20l2-9 5 3 5-9 2 9M5 20a2 2 0 100-4 2 2 0 000 4zM19 11a2 2 0 100-4 2 2 0 000 4z',
  plus: 'M12 8v8M8 12h8',
  food: 'M6 2v7a2 2 0 002 2v11M6 2v20M10 2v9M18 2c-2 0-3 2-3 5s1 4 3 4v11',
  calendar: 'M8 2v3M16 2v3M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
}

export default function NavIcon({ icon, className = 'w-4 h-4' }: { icon: string; className?: string }) {
  if (icon === 'insight') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
        <circle cx="12" cy="12" r="10" /><path d={PATHS.insight} />
      </svg>
    )
  }
  if (icon === 'plus') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
        <circle cx="12" cy="12" r="9" /><path d={PATHS.plus} />
      </svg>
    )
  }
  if (icon === 'chart') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d={PATHS[icon] ?? ''} />
    </svg>
  )
}
