import { ZONE_COLORS, ZONE_LABELS, type ZoneSummary } from '@/lib/zones'

function fmtDur(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

export default function ZoneBar({ zones }: { zones: ZoneSummary[] }) {
  if (!zones.length) return null
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden gap-px mb-3">
        {zones.map(z => (
          <div key={z.zoneNumber} style={{ width: `${z.pct}%`, backgroundColor: ZONE_COLORS[z.zoneNumber - 1] ?? '#6b7280' }} />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {zones.map(z => (
          <div key={z.zoneNumber} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-muted">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ZONE_COLORS[z.zoneNumber - 1] ?? '#6b7280' }} />
              {ZONE_LABELS[z.zoneNumber - 1] ?? `Zon ${z.zoneNumber}`}
            </span>
            <span className="font-mono text-fg">{z.pct}% · {fmtDur(z.secs)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
