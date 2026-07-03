'use client'

import { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type HeatingSystem = { type: string | null; role: string | null; installed_year: number | null; notes: string | null }
type OngoingProject = { title: string | null; goal: string | null; estimated_cost_sek: number | null; expected_savings_sek: number | null; notes: string | null }
type SolarPv = { capacity_kw: number | null; production_kwh_last_year: number | null; consumption_kwh_last_year: number | null; self_sufficiency_pct: number | null }
type EvCharging = { annual_kwh: number | null; charger: string | null }
type Extra = { solar_pv?: SolarPv | null; ev_charging?: EvCharging | null; renovations?: string[] | null; ongoing_projects?: OngoingProject[] | null; strategy_notes?: string | null } | null

type Profile = {
  address: string | null
  build_year: number | null
  living_area_sqm: number | null
  basement_area_sqm: number | null
  heating_type: string | null
  energy_class: string | null
  purchase_price_sek: number | null
  purchase_year: number | null
  smart_home_platform: string | null
  heating_systems: HeatingSystem[] | null
  source_url: string | null
  raw_extracted?: Record<string, unknown> | null
} | null

const sek = (v: number) => `${v.toLocaleString('sv-SE')} kr`

export default function HouseProfileCard({ profile }: { profile: Profile }) {
  const [editing, setEditing] = useState(false)
  const [address, setAddress] = useState(profile?.address ?? '')
  const [buildYear, setBuildYear] = useState(profile?.build_year?.toString() ?? '')
  const [livingArea, setLivingArea] = useState(profile?.living_area_sqm?.toString() ?? '')
  const [basementArea, setBasementArea] = useState(profile?.basement_area_sqm?.toString() ?? '')
  const [heatingType, setHeatingType] = useState(profile?.heating_type ?? '')
  const [energyClass, setEnergyClass] = useState(profile?.energy_class ?? '')
  const [purchasePrice, setPurchasePrice] = useState(profile?.purchase_price_sek?.toString() ?? '')
  const [purchaseYear, setPurchaseYear] = useState(profile?.purchase_year?.toString() ?? '')
  const [smartHome, setSmartHome] = useState(profile?.smart_home_platform ?? '')
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
      basement_area_sqm: basementArea ? Number(basementArea) : null,
      heating_type: heatingType.trim() || null,
      energy_class: energyClass.trim() || null,
      purchase_price_sek: purchasePrice ? Number(purchasePrice) : null,
      purchase_year: purchaseYear ? Number(purchaseYear) : null,
      smart_home_platform: smartHome.trim() || null,
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
            <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Källararea (m²)</label>
            <input type="number" value={basementArea} onChange={e => setBasementArea(e.target.value)}
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Energiklass</label>
            <input value={energyClass} onChange={e => setEnergyClass(e.target.value)} placeholder="T.ex. C"
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent" />
          </div>
        </div>
        <div>
          <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Uppvärmning (sammanfattning)</label>
          <input value={heatingType} onChange={e => setHeatingType(e.target.value)} placeholder="T.ex. Pelletspanna + solceller"
            className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Köppris (kr)</label>
            <input type="number" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)}
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Köpår</label>
            <input type="number" value={purchaseYear} onChange={e => setPurchaseYear(e.target.value)}
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent" />
          </div>
        </div>
        <div>
          <label className="text-muted text-xs uppercase tracking-wider mb-1 block">Smart hem-plattform</label>
          <input value={smartHome} onChange={e => setSmartHome(e.target.value)} placeholder="T.ex. Homey, Home Assistant"
            className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent" />
        </div>
        <p className="text-muted text-xs">Flera uppvärmningssystem, solceller, renoveringar och projekt fylls i enklast via Importera (fritext funkar bra — klistra bara in vad du vet).</p>
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
  const heatingSystems = profile?.heating_systems ?? []
  const extra = (profile?.raw_extracted?.extra ?? null) as Extra

  return (
    <div className="bg-card border border-edge rounded-2xl p-4">
      {hasData ? (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
            {profile?.address && <div><span className="text-muted text-xs block">Adress</span>{profile.address}</div>}
            {profile?.build_year && <div><span className="text-muted text-xs block">Byggår</span>{profile.build_year}</div>}
            {profile?.living_area_sqm != null && <div><span className="text-muted text-xs block">Boyta</span>{profile.living_area_sqm} m²{profile.basement_area_sqm != null && ` (varav ${profile.basement_area_sqm} m² källare)`}</div>}
            {profile?.heating_type && <div><span className="text-muted text-xs block">Uppvärmning</span>{profile.heating_type}</div>}
            {profile?.energy_class && <div><span className="text-muted text-xs block">Energiklass</span>{profile.energy_class}</div>}
            {profile?.purchase_price_sek != null && (
              <div><span className="text-muted text-xs block">Köpt</span>{sek(profile.purchase_price_sek)}{profile.purchase_year && ` (${profile.purchase_year})`}</div>
            )}
            {profile?.smart_home_platform && <div><span className="text-muted text-xs block">Smart hem</span>{profile.smart_home_platform}</div>}
          </div>

          {heatingSystems.length > 0 && (
            <div className="mb-3 pt-3 border-t border-edge">
              <div className="text-muted text-xs uppercase tracking-wider mb-2">Uppvärmningssystem</div>
              <div className="flex flex-col gap-1.5">
                {heatingSystems.map((h, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-medium">{h.type ?? '—'}</span>
                    {h.role && <span className="text-muted"> · {h.role}</span>}
                    {h.installed_year && <span className="text-muted"> · sedan {h.installed_year}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {extra && (extra.solar_pv || extra.ev_charging || extra.renovations?.length || extra.ongoing_projects?.length || extra.strategy_notes) && (
            <div className="pt-3 border-t border-edge text-sm flex flex-col gap-2">
              {extra.solar_pv && (
                <div>
                  <span className="text-muted text-xs block">Solceller</span>
                  {extra.solar_pv.capacity_kw != null && `${extra.solar_pv.capacity_kw} kW`}
                  {extra.solar_pv.self_sufficiency_pct != null && ` · ${extra.solar_pv.self_sufficiency_pct}% självförsörjning`}
                </div>
              )}
              {extra.ev_charging && (
                <div>
                  <span className="text-muted text-xs block">Elbilsladdning</span>
                  {extra.ev_charging.annual_kwh != null && `${extra.ev_charging.annual_kwh} kWh/år`}
                  {extra.ev_charging.charger && ` · ${extra.ev_charging.charger}`}
                </div>
              )}
              {!!extra.ongoing_projects?.length && (
                <div>
                  <span className="text-muted text-xs block">Pågående projekt</span>
                  {extra.ongoing_projects.map((p, i) => (
                    <div key={i}>{p.title}{p.estimated_cost_sek != null && ` · ${sek(p.estimated_cost_sek)}`}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-muted text-sm mb-3">Ingen husdata ännu — fyll i manuellt eller importera en länk.</p>
      )}
      <button onClick={() => setEditing(true)} className="text-accent text-xs hover:underline mt-3">
        {hasData ? 'Redigera' : 'Fyll i manuellt'}
      </button>
    </div>
  )
}
