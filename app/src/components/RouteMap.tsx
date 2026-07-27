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

function pinIcon(color: string, label: string) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:22px;height:22px;border-radius:50% 50% 50% 0;
      background:${color};transform:rotate(-45deg);
      border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5);
      display:flex;align-items:center;justify-content:center;
    "><span style="transform:rotate(45deg);color:#fff;font-size:10px;font-weight:700;">${label}</span></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -22],
  })
}
const startIcon = pinIcon('#16a34a', 'S')
const endIcon = pinIcon('#dc2626', 'M')

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => { map.setView([lat, lng], map.getZoom()) }, [lat, lng, map])
  return null
}

// A selected route can lie anywhere within the (up to 30km) search radius,
// so the fixed initial zoom/center often doesn't actually show it — fly the
// view to the route's own bounds whenever the selection changes.
function FitSelection({ routes, selectedId }: { routes: RouteResult[]; selectedId: number | null }) {
  const map = useMap()
  useEffect(() => {
    if (selectedId == null) return
    const route = routes.find(r => r.id === selectedId)
    const points = route?.path.flat()
    if (!points?.length) return
    map.flyToBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 15 })
  }, [selectedId, routes, map])
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
  const selectedRoute = routes.find(r => r.id === selectedId)
  const selectedPoints = selectedRoute?.path.flat() ?? []
  const start = selectedPoints[0]
  const end = selectedPoints[selectedPoints.length - 1]

  return (
    <div className="rounded-2xl overflow-hidden border border-edge isolate" style={{ height: 420 }}>
      <MapContainer center={[center.lat, center.lng]} zoom={12} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter lat={center.lat} lng={center.lng} />
        <FitSelection routes={routes} selectedId={selectedId} />
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
        {start && end && (
          <>
            <Marker position={start} icon={startIcon}><Popup>Start</Popup></Marker>
            <Marker position={end} icon={endIcon}><Popup>Mål</Popup></Marker>
          </>
        )}
      </MapContainer>
    </div>
  )
}
