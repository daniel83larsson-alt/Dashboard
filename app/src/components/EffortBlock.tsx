import { ZONE_COLORS, ZONE_LABELS } from '@/lib/zones'
import type { EffortSummary } from '@/lib/effort-summary'

// Zone distribution bar + Garmin Training Effect + the AI's one-sentence
// comment — shared by the weekly and monthly recap cards.
export default function EffortBlock({ effort, sentence, title }: { effort: EffortSummary; sentence?: string | null; title: string }) {
  return (
    <div className="bg-bg rounded-xl p-3 space-y-2">
      <div className="text-xs text-muted uppercase tracking-wider">{title}</div>
      {effort.zones.length > 0 && (
        <div>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
            {effort.zones.filter(z => z.pct > 0).map(z => (
              <div key={z.zoneNumber} style={{ width: `${z.pct}%`, background: ZONE_COLORS[z.zoneNumber - 1] }} title={`${ZONE_LABELS[z.zoneNumber - 1]}: ${z.pct} %`} />
            ))}
          </div>
          <div className="text-muted text-[11px] mt-1.5">
            {effort.zones.map(z => `Zon ${z.zoneNumber} ${z.pct} %`).join(' · ')} ({effort.zonePasses} av {effort.totalPasses} pass)
          </div>
        </div>
      )}
      {effort.tePasses > 0 && (
        <div className="text-sm text-fg">
          Träningseffekt (Garmin, 0–5): aerob snitt <span className="font-mono">{effort.teAvgAerobic ?? '–'}</span>, anaerob <span className="font-mono">{effort.teAvgAnaerobic ?? '–'}</span>
          {effort.hardest && <> · hårdast: {effort.hardest.label} {effort.hardest.startDate.slice(0, 10)} (aerob <span className="font-mono">{effort.hardest.aerobic ?? '–'}</span>)</>}
        </div>
      )}
      {sentence && <p className="text-sm text-fg leading-relaxed pt-1 border-t border-edge">{sentence}</p>}
    </div>
  )
}
