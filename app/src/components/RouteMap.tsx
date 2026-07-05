'use client'

import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect } from 'react'
import type { RouteResult } from '@/app/api/routes/search/route'

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

const ACCENT = '#ccd400'
const MUTED = '#6b7280'

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => { map.setView([lat, lng], map.getZoom()) }, [lat, lng, map])
  return null
}

export default function RouteMap({
  center,
  routes,
  selectedId,
  onSelect,
}: {
  center: { lat: number; lng: number }
  routes: RouteResult[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  return (
    <div className="rounded-2xl overflow-hidden border border-edge" style={{ height: 420 }}>
      <MapContainer center={[center.lat, center.lng]} zoom={12} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter lat={center.lat} lng={center.lng} />
        <Marker position={[center.lat, center.lng]} icon={markerIcon}>
          <Popup>Sökcentrum</Popup>
        </Marker>
        {routes.map(r => (
          r.path.map((segment, i) => (
            <Polyline
              key={`${r.id}-${i}`}
              positions={segment}
              pathOptions={{
                color: r.id === selectedId ? ACCENT : MUTED,
                weight: r.id === selectedId ? 5 : 3,
                opacity: r.id === selectedId ? 1 : 0.6,
              }}
              eventHandlers={{ click: () => onSelect(r.id) }}
            >
              <Popup>{r.name} · {r.distanceKm} km</Popup>
            </Polyline>
          ))
        ))}
      </MapContainer>
    </div>
  )
}
