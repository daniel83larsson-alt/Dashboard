export default function HouseMap({ lat, lng, address }: { lat: number; lng: number; address?: string | null }) {
  const d = 0.004
  const bbox = `${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}`
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`
  const openUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`

  return (
    <div className="bg-card border border-edge rounded-2xl overflow-hidden">
      <iframe src={src} className="w-full h-48 border-0" loading="lazy" title={address ?? 'Husets läge'} />
      <div className="px-4 py-2.5 text-xs text-muted flex items-center justify-between gap-2">
        <span className="truncate">{address ?? 'Husets läge'}</span>
        <a href={openUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline flex-shrink-0">Öppna karta ↗</a>
      </div>
    </div>
  )
}
