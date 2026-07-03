'use client'

import { useState, useEffect } from 'react'

type Device = {
  id: string
  name: string
  zone: string | null
  class: string
  available: boolean
  power: number | null
  energyTotal: number | null
}

export default function HomeyCard() {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [devices, setDevices] = useState<Device[]>([])
  const [note, setNote] = useState('')
  const [disconnecting, setDisconnecting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/homey/devices')
      const data = await res.json()
      setConnected(!!data.connected)
      setDevices(data.devices ?? [])
      setNote(data.note ?? data.error ?? '')
    } catch {
      setNote('Kunde inte nå Homey')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function disconnect() {
    setDisconnecting(true)
    await fetch('/api/homey/disconnect', { method: 'POST' })
    setDisconnecting(false)
    setConnected(false)
    setDevices([])
  }

  return (
    <div className="bg-card border border-edge rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-accent uppercase tracking-wider">Homey</div>
        {connected && <span className="text-[10px] text-muted uppercase tracking-wide">Ansluten</span>}
      </div>

      {loading ? (
        <p className="text-muted text-sm">Laddar...</p>
      ) : !connected ? (
        <>
          <p className="text-muted text-sm mb-3">Anslut din Homey för att se enheter och energidata här. Hemkoll kan bara läsa — aldrig styra något.</p>
          <a
            href="/api/homey/authorize"
            className="inline-block bg-accent text-bg text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
          >
            Anslut Homey
          </a>
          {note && <p className="text-muted text-xs mt-2">{note}</p>}
        </>
      ) : (
        <>
          {devices.length === 0 ? (
            <p className="text-muted text-sm mb-3">{note || 'Inga enheter hittades'}</p>
          ) : (
            <ul className="flex flex-col gap-2 mb-3">
              {devices.slice(0, 8).map(d => (
                <li key={d.id} className="flex items-center justify-between text-sm gap-2">
                  <span className={d.available ? '' : 'text-muted line-through'}>{d.name}</span>
                  <span className="text-muted text-xs flex-shrink-0">
                    {d.power != null ? `${d.power} W` : (d.zone ?? d.class)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {devices.length > 8 && <p className="text-muted text-xs mb-2">+ {devices.length - 8} till</p>}
          <button onClick={disconnect} disabled={disconnecting} className="text-muted text-xs hover:underline disabled:opacity-50">
            {disconnecting ? 'Kopplar från...' : 'Koppla från'}
          </button>
        </>
      )}
    </div>
  )
}
