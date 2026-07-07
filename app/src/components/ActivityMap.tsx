'use client'

import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect } from 'react'

// Leaflet's default marker icons reference image files that don't resolve
// correctly when bundled — point them at CDN-hosted copies instead.
const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

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

function FitPolyline({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24] })
  }, [points, map])
  return null
}

export default function ActivityMap({ lat, lng, label, polyline }: { lat: number; lng: number; label: string; polyline?: [number, number][] | null }) {
  const hasRoute = !!polyline && polyline.length > 1
  const start = hasRoute ? polyline![0] : null
  const end = hasRoute ? polyline![polyline!.length - 1] : null

  return (
    <div className="rounded-2xl overflow-hidden border border-edge" style={{ height: hasRoute ? 300 : 220 }}>
      <MapContainer center={[lat, lng]} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {hasRoute ? (
          <>
            <FitPolyline points={polyline!} />
            <Polyline positions={polyline!} pathOptions={{ color: '#ccd400', weight: 4, opacity: 0.9 }} />
            <Marker position={start!} icon={startIcon}><Popup>Start</Popup></Marker>
            <Marker position={end!} icon={endIcon}><Popup>Mål</Popup></Marker>
          </>
        ) : (
          <Marker position={[lat, lng]} icon={markerIcon}>
            <Popup>{label}</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  )
}
