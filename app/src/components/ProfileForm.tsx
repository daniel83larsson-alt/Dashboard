'use client'

import { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ChipPicker, COMMON_EQUIPMENT, COMMON_SPORTS } from '@/components/ChipPicker'

type FlagEntry = { at: string; reason: string; snippet: string }

type Profile = {
  id: string
  name?: string | null
  llm_api_key_encrypted?: string | null
  llm_provider?: string | null
  locked?: boolean | null
  flagged_attempts?: number | null
  flag_log?: FlagEntry[] | null
  home_equipment?: string[] | null
  selected_sports?: string[] | null
  daily_step_goal?: number | null
  weight_kg?: number | null
  weekly_load_goal?: number | null
  height_cm?: number | null
  birth_year?: number | null
  biological_sex?: 'male' | 'female' | null
  daily_calorie_goal?: number | null
}


const CONTEXT_PLACEHOLDER = `Beskriv dig själv, din situation och din träning — ju mer bakgrund, desto bättre feedback.

Exempel:
- Jag tränar 3-4 gånger/vecka, mestadels 20-30 min pass
- Jobb: stillasittande kontorsjobb, pendlar 1h/dag — påverkar när jag orkar träna
- Personlighet: tävlingsinriktad, blir lätt uttråkad av för lugna pass
- Mål: förbättra mitt personbästa på en standarddistans
- Vill bygga aerob bas, hålla pulsen nere på längre pass
- Skador/begränsningar: ont i vänster axel ibland vid högintensiva pass`

export default function ProfileForm({
  profile,
  userEmail,
  hasConcept2,
  hasGarmin,
  concept2Synced,
  garminSynced,
  savedContext,
}: {
  profile: Profile | null
  userEmail: string
  hasConcept2: boolean
  hasGarmin: boolean
  concept2Synced: boolean
  garminSynced: boolean
  savedContext: string
}) {
  const [name, setName] = useState(profile?.name ?? '')
  const [apiKey, setApiKey] = useState('')
  const [provider, setProvider] = useState(profile?.llm_provider ?? 'gemini')
  const [context, setContext] = useState(savedContext)
  const [equipment, setEquipment] = useState<string[]>(profile?.home_equipment ?? [])
  const [sports, setSports] = useState<string[]>(profile?.selected_sports ?? [])
  const [stepGoal, setStepGoal] = useState(profile?.daily_step_goal ?? 10000)
  const [weightKg, setWeightKg] = useState(profile?.weight_kg?.toString() ?? '')
  const [loadGoal, setLoadGoal] = useState(profile?.weekly_load_goal?.toString() ?? '')
  const [heightCm, setHeightCm] = useState(profile?.height_cm?.toString() ?? '')
  const [birthYear, setBirthYear] = useState(profile?.birth_year?.toString() ?? '')
  const [biologicalSex, setBiologicalSex] = useState(profile?.biological_sex ?? '')
  const [calorieGoal, setCalorieGoal] = useState(profile?.daily_calorie_goal?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [garminSyncing, setGarminSyncing] = useState(false)
  const [garminMsg, setGarminMsg] = useState('')
  const [garminEmail, setGarminEmail] = useState('')
  const [garminPassword, setGarminPassword] = useState('')
  const [garminSaving, setGarminSaving] = useState(false)
  const [garminConnected, setGarminConnected] = useState(hasGarmin)
  const router = useRouter()

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createSupabaseClient()

    const parsedWeight = parseFloat(weightKg)
    const parsedLoadGoal = parseFloat(loadGoal)
    const parsedHeight = parseFloat(heightCm)
    const parsedBirthYear = parseInt(birthYear, 10)
    const parsedCalorieGoal = parseInt(calorieGoal, 10)
    await supabase.from('profiles').update({
      name,
      llm_provider: provider,
      home_equipment: equipment,
      selected_sports: sports,
      daily_step_goal: stepGoal,
      weight_kg: weightKg.trim() && !Number.isNaN(parsedWeight) ? parsedWeight : null,
      weekly_load_goal: loadGoal.trim() && !Number.isNaN(parsedLoadGoal) ? parsedLoadGoal : null,
      height_cm: heightCm.trim() && !Number.isNaN(parsedHeight) ? parsedHeight : null,
      birth_year: birthYear.trim() && !Number.isNaN(parsedBirthYear) ? parsedBirthYear : null,
      biological_sex: biologicalSex || null,
      daily_calorie_goal: calorieGoal.trim() && !Number.isNaN(parsedCalorieGoal) ? parsedCalorieGoal : null,
    }).eq('id', profile?.id ?? '')

    if (apiKey.trim()) {
      await fetch('/api/profile/save-llm-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })
    }

    if (context !== savedContext) {
      await fetch('/api/context/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      })
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  async function syncNow() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/activities/sync', { method: 'POST' })
      const data = await res.json()
      if (data.synced !== undefined) {
        setSyncMsg(`Synkade ${data.synced} nya pass`)
        router.refresh()
      } else {
        setSyncMsg(data.error ?? 'Något gick fel')
      }
    } catch {
      setSyncMsg('Nätverksfel')
    }
    setSyncing(false)
  }

  async function saveGarmin(e: React.FormEvent) {
    e.preventDefault()
    setGarminSaving(true)
    setGarminMsg('')
    try {
      const res = await fetch('/api/garmin/save-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: garminEmail.trim(), password: garminPassword }),
      })
      const data = await res.json()
      if (data.ok) {
        setGarminConnected(true)
        setGarminPassword('')
        setGarminMsg('Ansluten!')
      } else {
        setGarminMsg(data.error ?? 'Något gick fel')
      }
    } catch {
      setGarminMsg('Nätverksfel')
    }
    setGarminSaving(false)
  }

  async function syncGarmin() {
    setGarminSyncing(true)
    setGarminMsg('')
    try {
      const res = await fetch('/api/activities/sync-garmin', { method: 'POST' })
      const data = await res.json()
      if (data.synced !== undefined) {
        const reclass = data.reclassified ? ` · ${data.reclassified} omklassade` : ''
        setGarminMsg(`Synkade ${data.synced} nya pass${reclass}`)
        router.refresh()
      } else {
        setGarminMsg(data.error ?? 'Något gick fel')
      }
    } catch {
      setGarminMsg('Nätverksfel')
    }
    setGarminSyncing(false)
  }

  async function signOut() {
    const supabase = createSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const hasApiKey = !!profile?.llm_api_key_encrypted

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      {/* Account */}
      <div className="bg-card border border-edge rounded-2xl p-4">
        <div className="text-xs text-muted uppercase tracking-wider mb-2">Konto</div>
        <div className="text-fg text-sm">{userEmail}</div>
      </div>

      {/* Profile */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-4">
        <div className="text-xs text-muted uppercase tracking-wider">Profil</div>
        <div>
          <label className="text-muted text-xs block mb-1.5">Namn</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="För- och efternamn"
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <div>
          <label className="text-muted text-xs block mb-1.5">Stegmål per dag</label>
          <input
            type="number"
            min={1000}
            step={500}
            value={stepGoal}
            onChange={e => setStepGoal(Math.max(0, parseInt(e.target.value, 10) || 0))}
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
          />
          <p className="text-muted text-xs mt-1.5">Styr steg-progressbaren och steg-streaken på Översikt.</p>
        </div>
        <div>
          <label className="text-muted text-xs block mb-1.5">Veckomål träningsbelastning (valfritt)</label>
          <input
            type="number"
            min={0}
            step={10}
            placeholder="Auto — ditt eget snitt senaste 8 veckorna"
            value={loadGoal}
            onChange={e => setLoadGoal(e.target.value)}
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
          />
          <p className="text-muted text-xs mt-1.5">Styr belastningsbaren på Översikt. Lämna tomt för att jämföra mot ditt eget snitt istället för ett fast mål.</p>
        </div>
        <div>
          <label className="text-muted text-xs block mb-1.5">Vikt (kg)</label>
          <input
            type="number"
            min={20}
            max={300}
            step={0.5}
            inputMode="decimal"
            value={weightKg}
            onChange={e => setWeightKg(e.target.value)}
            placeholder="t.ex. 78"
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
          />
          <p className="text-muted text-xs mt-1.5">Används för att räkna ut kalorier när du loggar ett pass manuellt.</p>
        </div>
      </div>

      {/* Body & calories */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-4">
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Kropp & kalorier</div>
          <p className="text-muted text-xs">Används för att uppskatta din basförbränning (vilopuls) i Mat-funktionen. Allt är valfritt — saknas något används ett schablonvärde, tydligt märkt som uppskattning.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-muted text-xs block mb-1.5">Längd (cm)</label>
            <input
              type="number"
              min={100}
              max={250}
              inputMode="numeric"
              value={heightCm}
              onChange={e => setHeightCm(e.target.value)}
              placeholder="t.ex. 180"
              className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="text-muted text-xs block mb-1.5">Födelseår</label>
            <input
              type="number"
              min={1920}
              max={new Date().getFullYear()}
              inputMode="numeric"
              value={birthYear}
              onChange={e => setBirthYear(e.target.value)}
              placeholder="t.ex. 1985"
              className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="text-muted text-xs block mb-1.5">Biologiskt kön</label>
          <select
            value={biologicalSex}
            onChange={e => setBiologicalSex(e.target.value as 'male' | 'female' | '')}
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-accent"
          >
            <option value="">Vill inte ange</option>
            <option value="male">Man</option>
            <option value="female">Kvinna</option>
          </select>
        </div>
        <div>
          <label className="text-muted text-xs block mb-1.5">Dagligt kalorimål (valfritt)</label>
          <input
            type="number"
            min={800}
            max={8000}
            step={50}
            inputMode="numeric"
            value={calorieGoal}
            onChange={e => setCalorieGoal(e.target.value)}
            placeholder="t.ex. 2400"
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
          />
          <p className="text-muted text-xs mt-1.5">Styr kalorirutan på Översikt. Lämna tomt för att bara se ätit/bränt utan ett mål att jämföra mot.</p>
        </div>
      </div>

      {/* Training context */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Om dig</div>
          <p className="text-muted text-xs">Tas med i varje coachsamtal — jobb, livssituation, personlighet, skador, mål. Allt som hjälper AI:n förstå helheten, inte bara siffrorna.</p>
        </div>
        <textarea
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder={CONTEXT_PLACEHOLDER}
          rows={7}
          className="w-full bg-bg border border-edge rounded-xl px-4 py-3 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors resize-none leading-relaxed"
        />
      </div>

      {/* Equipment & sports */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-4">
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Utrustning & aktiviteter</div>
          <p className="text-muted text-xs">Vad du har hemma och vilka sporter du utövar — så coachens tips utgår från det som faktiskt finns tillgängligt istället för att gissa.</p>
        </div>
        <ChipPicker
          label="Utrustning hemma"
          options={COMMON_EQUIPMENT}
          selected={equipment}
          onToggle={v => setEquipment(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])}
          onAddCustom={v => setEquipment(prev => prev.includes(v) ? prev : [...prev, v])}
        />
        <ChipPicker
          label="Aktiviteter/sporter"
          options={COMMON_SPORTS}
          selected={sports}
          onToggle={v => setSports(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])}
          onAddCustom={v => setSports(prev => prev.includes(v) ? prev : [...prev, v])}
        />
      </div>

      {/* Concept2 */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        <div className="text-xs text-muted uppercase tracking-wider">Concept2 Logbook</div>
        {hasConcept2 ? (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm text-fg flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full inline-block ${concept2Synced ? 'bg-accent' : 'bg-amber-400'}`} />
                {concept2Synced ? 'Ansluten' : 'Ansluten — väntar på första synk'}
              </div>
              {syncMsg && <div className="text-xs text-lcd mt-1">{syncMsg}</div>}
            </div>
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing}
              className="text-xs bg-bg border border-edge px-3 py-2 rounded-lg text-fg disabled:opacity-50 hover:border-accent transition-colors"
            >
              {syncing ? 'Synkar...' : 'Synka nu'}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-muted text-xs mb-2">
              Anslut Concept2 Logbook för att automatiskt synka dina roddpass.
            </p>
            <div className="bg-bg rounded-xl p-3 mb-3 text-xs text-muted leading-relaxed">
              <span className="text-fg font-medium">Så funkar det:</span> klicka på knappen nedan så skickas du till Concept2 Logbooks egen inloggningssida (log.concept2.com). Logga in med samma konto du använder i Concept2-appen eller på ergometern. Du loggar in direkt hos Concept2 — vi ser eller sparar aldrig ditt lösenord, bara en åtkomsttoken efteråt.
            </div>
            <a
              href="/api/auth/concept2"
              className="inline-block bg-accent text-bg text-xs font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
            >
              Anslut Concept2
            </a>
          </div>
        )}
      </div>

      {/* Garmin */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-3">
        <div className="text-xs text-muted uppercase tracking-wider">Garmin Connect</div>
        {garminConnected ? (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm text-fg flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full inline-block ${garminSynced ? 'bg-accent' : 'bg-amber-400'}`} />
                {garminSynced ? 'Ansluten' : 'Ansluten — väntar på första synk'}
              </div>
              {garminMsg && <div className="text-xs text-lcd mt-1">{garminMsg}</div>}
            </div>
            <button
              type="button"
              onClick={syncGarmin}
              disabled={garminSyncing}
              className="text-xs bg-bg border border-edge px-3 py-2 rounded-lg text-fg disabled:opacity-50 hover:border-accent transition-colors"
            >
              {garminSyncing ? 'Synkar...' : 'Synka nu'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-muted text-xs">
              Ange dina Garmin Connect-uppgifter för att synka aktiviteter och hälsodata.
            </p>
            <div className="bg-bg rounded-xl p-3 text-xs text-muted leading-relaxed">
              <span className="text-fg font-medium">Vilka uppgifter behövs?</span> samma e-post och lösenord som du använder för att logga in på connect.garmin.com eller i Garmin Connect-appen på telefonen. Inget separat konto behövs. Lösenordet krypteras innan det sparas och används bara för att hämta dina egna aktiviteter, sömn, puls och steg.
            </div>
            <div>
              <label className="text-muted text-xs block mb-1.5">E-post</label>
              <input
                type="email"
                value={garminEmail}
                onChange={e => setGarminEmail(e.target.value)}
                placeholder="din@email.com"
                className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="text-muted text-xs block mb-1.5">Lösenord</label>
              <input
                type="password"
                value={garminPassword}
                onChange={e => setGarminPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            {garminMsg && <div className="text-xs text-lcd">{garminMsg}</div>}
            <button
              type="button"
              onClick={saveGarmin}
              disabled={garminSaving || !garminEmail.trim() || !garminPassword}
              className="text-xs bg-accent text-bg font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {garminSaving ? 'Ansluter...' : 'Anslut Garmin'}
            </button>
          </div>
        )}
      </div>

      {/* AI settings */}
      <div className="bg-card border border-edge rounded-2xl p-4 flex flex-col gap-4">
        <div className="text-xs text-muted uppercase tracking-wider">AI-inställningar</div>
        <p className="text-muted text-xs -mt-2">
          Gemini används som standard (gratis). Lägg till din egen nyckel för att prioritera den.
        </p>
        <div>
          <label className="text-muted text-xs block mb-1.5">Leverantör (valfritt)</label>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-accent"
          >
            <option value="gemini">Google Gemini (standard)</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
          </select>
        </div>
        <div>
          <label className="text-muted text-xs block mb-1.5">
            Egen API-nyckel {hasApiKey ? '(sparat — lämna tomt för att behålla)' : '(valfritt)'}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={
              hasApiKey
                ? '••••••••••••'
                : provider === 'anthropic'
                ? 'sk-ant-...'
                : provider === 'openai'
                ? 'sk-...'
                : 'AIzaSy... (från aistudio.google.com)'
            }
            className="w-full bg-bg border border-edge rounded-xl px-4 py-2.5 text-sm text-fg placeholder-muted focus:outline-none focus:border-accent transition-colors"
          />
          {!hasApiKey && provider === 'gemini' && (
            <p className="text-muted text-xs mt-1.5">
              Hämta på aistudio.google.com → Get API key (nyckeln börjar med AIzaSy...)
            </p>
          )}
          {!hasApiKey && provider === 'anthropic' && (
            <p className="text-muted text-xs mt-1.5">
              Hämtas på console.anthropic.com → API Keys
            </p>
          )}
        </div>
      </div>

      {/* Chat security */}
      {((profile?.flagged_attempts ?? 0) > 0 || profile?.locked) && (
        <div className={`bg-card border rounded-2xl p-4 flex flex-col gap-3 ${profile?.locked ? 'border-red-500/40' : 'border-amber-500/30'}`}>
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-muted">Chattsäkerhet</div>
            {profile?.locked ? (
              <span className="text-xs text-red-400 font-medium">🔒 Kontot låst</span>
            ) : (
              <span className="text-xs text-amber-400 font-medium">{profile?.flagged_attempts} flaggade</span>
            )}
          </div>
          {profile?.locked && (
            <p className="text-muted text-xs leading-relaxed">
              Chatten är låst efter upprepade misstänkta meddelanden (kod, prompt-injektion eller orelaterade frågor). Lås upp manuellt i Supabase under tabellen <span className="text-fg font-mono">profiles</span> genom att sätta <span className="text-fg font-mono">locked = false</span>.
            </p>
          )}
          {!!profile?.flag_log?.length && (
            <div className="flex flex-col gap-1.5">
              {profile.flag_log.slice(0, 5).map((f, i) => (
                <div key={i} className="bg-bg rounded-lg px-3 py-2 text-xs">
                  <div className="flex justify-between text-muted">
                    <span className="text-fg">{f.reason}</span>
                    <span>{new Date(f.at).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="text-muted mt-0.5 truncate">&quot;{f.snippet}&quot;</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-accent text-bg font-semibold py-3 rounded-xl disabled:opacity-50 disabled:bg-edge disabled:text-muted disabled:cursor-not-allowed transition-opacity text-sm"
      >
        {saved ? '✓ Sparat' : saving ? 'Sparar...' : 'Spara ändringar'}
      </button>

      <button
        type="button"
        onClick={signOut}
        className="text-muted text-sm py-2 hover:text-fg transition-colors"
      >
        Logga ut
      </button>
    </form>
  )
}
