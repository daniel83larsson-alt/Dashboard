'use client'

import { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Profile = {
  address: string | null
  build_year: number | null
  living_area_sqm: number | null
  heating_type: string | null
  energy_class: string | null
  source_url: string | null
} | null

export default function HouseProfileCard({ profile }: { profile: Profile }) {
  const [editing, setEditing] = useState(false)
  const [address, setAddress] = useState(profile?.address ?? '')
  const [buildYear, setBuildYear] = useState(profile?.build_year?.toString() ?? '')
  const [livingArea, setLivingArea] = useState(profile?.living_area_sqm?.toString() ?? '')
  const [heatingType, setHeatingType] = useState(profile?.heating_type ?? '')
  const [energyClass, setEnergyClass] = useState(profile?.energy_class ?? '')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function save() {
    setSaving(true)
    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('hemkoll_house_profile').upsert({
      user_id: user.id,
      address: address.trim() || null,
      build_year: buildYear ? Number(buildYear) : null,
      living_area_sqm: livingArea ? Number(livingArea) : null,
      heating_type: heatingType.trim() || null,
      energy_class: energyClass.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  if (editing) {
    return (
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        <div>
          <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Adress</label>
          <input value={address} onChange={e => setAddress(e.target.value)}
            className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Byggår</label>
            <input type="number" value={buildYear} onChange={e => setBuildYear(e.target.value)}
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Boyta (m²)</label>
            <input type="number" value={livingArea} onChange={e => setLivingArea(e.target.value)}
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Uppvärmning</label>
            <input value={heatingType} onChange={e => setHeatingType(e.target.value)} placeholder="T.ex. Bergvärme"
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Energiklass</label>
            <input value={energyClass} onChange={e => setEnergyClass(e.target.value)} placeholder="T.ex. C"
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="bg-accent text-bg text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? 'Sparar...' : 'Spara'}
          </button>
          <button onClick={() => setEditing(false)} className="text-muted text-sm px-4 py-2">Avbryt</button>
        </div>
      </div>
    )
  }

  const hasData = profile && (profile.address || profile.build_year || profile.living_area_sqm || profile.heating_type || profile.energy_class)

  return (
    <div className="bg-card border border-edge rounded-2xl p-4">
      {hasData ? (
        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
          {profile?.address && <div><span className="text-muted text-xs block">Adress</span>{profile.address}</div>}
          {profile?.build_year && <div><span className="text-muted text-xs block">Byggår</span>{profile.build_year}</div>}
          {profile?.living_area_sqm && <div><span className="text-muted text-xs block">Boyta</span>{profile.living_area_sqm} m²</div>}
          {profile?.heating_type && <div><span className="text-muted text-xs block">Uppvärmning</span>{profile.heating_type}</div>}
          {profile?.energy_class && <div><span className="text-muted text-xs block">Energiklass</span>{profile.energy_class}</div>}
        </div>
      ) : (
        <p className="text-muted text-sm mb-3">Ingen husdata ännu — fyll i manuellt eller importera en länk.</p>
      )}
      <button onClick={() => setEditing(true)} className="text-accent text-xs hover:underline">
        {hasData ? 'Redigera' : 'Fyll i manuellt'}
      </button>
    </div>
  )
}
