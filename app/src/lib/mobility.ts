// Fixed, research-grounded exercise library for the Rörlighet (mobility)
// generator. Content and safety notes transcribed from Daniel's own
// research review — deliberately NOT AI-generated per session, so the
// caution text never drifts from what was actually vetted.

export type Region =
  | 'breathing'
  | 'hip'
  | 'ankle'
  | 'thoracic'
  | 'shoulder'
  | 'neck'
  | 'forearm'
  | 'posterior_chain'

export const REGION_ORDER: Region[] = [
  'breathing', 'hip', 'ankle', 'thoracic', 'shoulder', 'neck', 'forearm', 'posterior_chain',
]

export const REGION_LABELS: Record<Region, string> = {
  breathing: 'Andning',
  hip: 'Höft & bäcken',
  ankle: 'Ankel',
  thoracic: 'Bröstrygg',
  shoulder: 'Axlar & skulderblad',
  neck: 'Nacke',
  forearm: 'Underarm',
  posterior_chain: 'Bakre kedja',
}

export type Exercise = {
  id: string
  region: Region
  name: string
  dose: string
  estimatedSeconds: number
  instructions: string[]
  why: string
  caution?: string
}

export const EXERCISES: Exercise[] = [
  {
    id: 'breathing-90-90',
    region: 'breathing',
    name: '90/90 diafragmatisk andning',
    dose: '5-8 andetag',
    estimatedSeconds: 60,
    instructions: [
      'Ligg på rygg, underben på en stol/soffa så höft och knä bildar 90°.',
      'Andas in genom näsan så magen (inte bröstet) höjs.',
      'Andas ut långsamt genom munnen, låt magen sjunka helt.',
    ],
    why: 'Diafragman är anatomiskt kopplad till bröstryggens rörlighet och till nackens accessoriska andningsmuskler (scalener, sternocleidomastoideus). Ytlig bröstandning korrelerar med ökad aktivitet i just dessa nackmuskler — en möjlig delförklaring till varför spänningen slår till snabbt.',
  },
  {
    id: 'hip-cat-cow',
    region: 'hip',
    name: 'Cat-Cow',
    dose: '10 rep',
    estimatedSeconds: 40,
    instructions: [
      'Stå på alla fyra, händer under axlar, knän under höfter.',
      'Andas in: svanka, lyft bröst och säte (ko).',
      'Andas ut: runda ryggen, haka mot bröst (katt).',
    ],
    why: 'Uppvärmning för höft/bäcken och rygg innan resten av passet — rör bålen genom hela rörelsebanan i kombination med andning.',
  },
  {
    id: 'hip-flexor-stretch',
    region: 'hip',
    name: 'Höftböjarstretch, halvknästående',
    dose: '30 sek/sida',
    estimatedSeconds: 60,
    instructions: [
      'Halvknästående, ena knät i golvet, andra foten framför i 90°.',
      'Skjut höften framåt tills stretch känns framtill på det bakre låret/höften.',
      'Håll bäckenet neutralt, undvik att svanka för mycket.',
    ],
    why: 'Motverkar förkortade höftböjare från långvarigt sittande, en av grunderna till obalans uppåt i kedjan.',
  },
  {
    id: 'hip-90-90',
    region: 'hip',
    name: '90/90 hip',
    dose: '30 sek/sida',
    estimatedSeconds: 60,
    instructions: [
      'Sitt med främre ben böjt 90° framför kroppen, bakre ben böjt 90° åt sidan.',
      'Luta överkroppen sakta framåt över det främre benet.',
      'Byt sida.',
    ],
    why: 'Rör höftleden genom intern och extern rotation — rörelseriktningar som annars sällan tränas i vardagen.',
  },
  {
    id: 'hip-glute-bridge',
    region: 'hip',
    name: 'Glute bridge hold',
    dose: '3×20 sek',
    estimatedSeconds: 60,
    instructions: [
      'Ligg på rygg, fötter i golvet, knäbredd höftbredd.',
      'Pressa upp höften till en rak linje axel–höft–knä, kläm sätesmusklerna.',
      'Håll, sänk kontrollerat.',
    ],
    why: 'Aktiverar sätesmuskulaturen som ofta är underaktiv vid mycket sittande, vilket avlastar bakre kedjan (ischias-liknande besvär).',
  },
  {
    id: 'ankle-knee-to-wall',
    region: 'ankle',
    name: 'Knee-to-wall ankeldorsalflexion',
    dose: '10 rep/sida',
    estimatedSeconds: 60,
    instructions: [
      'Stå med tårna en bit från en vägg, för fram knät mot väggen utan att hälen lyfter.',
      'Hitta max avstånd där knät precis når väggen med hälen kvar i golvet.',
      'Upprepa kontrollerat.',
    ],
    why: 'Nedsatt ankeldorsalflexion är kopplad till kompensatoriska mönster uppåt i hela kedjan (knä, höft, rygg) — relevant vid vadspänning/hälbesvär.',
  },
  {
    id: 'thoracic-rotation',
    region: 'thoracic',
    name: 'Thorakal rotation, halvknästående',
    dose: '8 rep/sida',
    estimatedSeconds: 40,
    instructions: [
      'Halvknästående, ena handen bakom huvudet.',
      'Rotera överkroppen så armbågen pekar upp mot taket, följ med blicken.',
      'Rotera tillbaka kontrollerat, upprepa.',
    ],
    why: 'Riktad rörlighetsövning för bröstryggens rotation, en rörelseriktning som brukar bli stel vid mycket skrivbordsarbete.',
  },
  {
    id: 'thoracic-open-book',
    region: 'thoracic',
    name: 'Open book stretch',
    dose: '30 sek/sida',
    estimatedSeconds: 60,
    instructions: [
      'Ligg i sidoläge, knän böjda framför kroppen.',
      'För den översta armen i en båge bakåt tills den ligger mot golvet på andra sidan, följ med blicken.',
      'Håll, andas lugnt, byt sida.',
    ],
    why: 'Statisk rörlighetsövning för bröstryggens rotation och bröstmuskulatur, kompletterar den dynamiska rotationsövningen.',
  },
  {
    id: 'thoracic-foam-roller',
    region: 'thoracic',
    name: 'Foam roller thorakal extension, dynamisk',
    dose: '8-10 rep',
    estimatedSeconds: 60,
    instructions: [
      'Ligg med foam rollern tvärs under bröstryggen, händer bakom huvudet, fötter i golvet.',
      'Res dig sakta upp mot rullen så bröstryggen extenderar över den, sjunk sedan ner igen.',
      'Rör dig kontrollerat, ingen studs.',
    ],
    why: 'Bröstrygg-extension var i det ursprungliga passet bara statisk. En dynamisk variant (resa sig upp/ner över rullen) ger bättre funktionell överföring än passiv stretch enligt forskning på kontorsarbetares thorakala rörlighet.',
    caution: 'Placera rullen mot bröstryggens ben (revben/bröstkota), aldrig direkt mot ländryggen eller nacken. Rör dig långsamt och kontrollerat — ingen studs, och avbryt om det gör ont snarare än känns som ett tryck/stretch.',
  },
  {
    id: 'shoulder-wall-slides',
    region: 'shoulder',
    name: 'Wall slides',
    dose: '10 rep',
    estimatedSeconds: 40,
    instructions: [
      'Stå med rygg, huvud, armbågar och handryggar mot väggen, armar i en "W".',
      'För armarna sakta uppåt längs väggen mot ett "Y" utan att tappa kontakten mot väggen.',
      'Sänk kontrollerat tillbaka till "W".',
    ],
    why: 'Tränar skapulohumeral rytm (koordinerad rörelse skulderblad–axel), som blir störd vid framåtböjd hållning. Kräver ingen utrustning.',
  },
  {
    id: 'shoulder-modified-hang',
    region: 'shoulder',
    name: 'Modifierad hängning i stång',
    dose: '15-20 sek',
    estimatedSeconds: 30,
    instructions: [
      'Greppa en stång, fötter i lätt kontakt med golv/pall (delvis avlastning) — inte full kroppsvikt.',
      'Häng avslappnat i axlarna, andas lugnt.',
      'Efter några veckor: bygg gradvis till korta fria häng (10-15 sek).',
    ],
    why: 'Traction/drag-baserad avlastning har visst stöd för kortvarig upplevd lättnad i axlar/nacke. Greppstyrka kopplas dessutom i stora epidemiologiska studier till lägre allorsaksdödlighet hos medelålders/äldre.',
    caution: 'Svagare/mer anekdotisk evidens än övriga övningar i passet. Full kroppsviktshängning belastar grepp (kan trigga musarm) och axelkapsel/rotatorkuff rejält — kan initialt förvärra snarare än lindra vid en redan känslig axel/nacke. Håll fötterna i lätt kontakt med golvet till en början, och avbryt direkt vid stickningar eller domningar i händer/armar.',
  },
  {
    id: 'shoulder-doorway-stretch',
    region: 'shoulder',
    name: 'Dörrstretch',
    dose: '30 sek/sida',
    estimatedSeconds: 60,
    instructions: [
      'Stå i en dörröppning, underarm mot dörrkarmen, armbåge i ca 90°.',
      'Luta kroppen sakta framåt genom dörröppningen tills stretch känns framtill i axel/bröst.',
      'Håll, byt sida.',
    ],
    why: 'Motverkar de framåtdragna axlarna (övre-korsat-syndrom) som följer av mycket skrivbordsarbete.',
  },
  {
    id: 'shoulder-rhomboid-stretch',
    region: 'shoulder',
    name: 'Romboidstretch',
    dose: '30 sek',
    estimatedSeconds: 30,
    instructions: [
      'Sträck fram båda armarna, greppa tag i något (t.ex. en dörrkarm eller egna händer i varandra).',
      'Runda övre ryggen och skjut skulderbladen isär, luta dig lätt bakåt.',
      'Håll och andas lugnt.',
    ],
    why: 'Stretchar musklerna mellan skulderbladen som ofta blir spända/överbelastade av kompensation vid framåtdragna axlar.',
  },
  {
    id: 'neck-levator-scapulae',
    region: 'neck',
    name: 'Levator scapulae-stretch',
    dose: '30 sek/sida',
    estimatedSeconds: 60,
    instructions: [
      'Vrid huvudet ca 45° mot den friska sidan.',
      'För hakan mot bröstet, som om du tittar ner i din egen armhåla.',
      'Använd ev. handen för ett lätt, försiktigt extra tryck. Håll, byt sida.',
    ],
    why: 'Riktar sig specifikt mot den typ av ensidiga, snabba spänning som beskrivs — troligen muskulär skyddsreflex/triggerpunkt i levator scapulae.',
  },
  {
    id: 'neck-upper-trap',
    region: 'neck',
    name: 'Övre trapezius-stretch',
    dose: '30 sek/sida',
    estimatedSeconds: 60,
    instructions: [
      'Sitt eller stå, fixera ena axeln lätt nedåt (t.ex. håll i stolskanten).',
      'Böj huvudet åt motsatt sida tills stretch känns längs sidan av halsen.',
      'Håll, byt sida.',
    ],
    why: 'Riktar sig mot övre trapezius, den andra muskeln som ofta triggas vid den beskrivna ensidiga nackspänningen.',
  },
  {
    id: 'neck-isometrics',
    region: 'neck',
    name: 'Nack-isometri, 4 riktningar',
    dose: '5×5-10 sek',
    estimatedSeconds: 60,
    instructions: [
      'Press pannan mot din egen hand utan att huvudet rör sig, håll 5-10 sek.',
      'Upprepa mot bakhuvudet, och mot vänster/höger tinning.',
      'Lätt-måttlig kraft, aldrig maximalt.',
    ],
    why: 'Ger, även i låg dos, signifikant smärtreduktion vid mekanisk nacksmärta och är säkrare än dynamisk belastning för en känslig nacke.',
  },
  {
    id: 'neck-chin-tucks',
    region: 'neck',
    name: 'Chin tucks',
    dose: '10 rep',
    estimatedSeconds: 30,
    instructions: [
      'Sitt eller stå upprätt, dra hakan rakt bakåt (som ett "dubbelhaka"-rörelse) utan att böja nacken.',
      'Håll 2-3 sek, släpp.',
      'Upprepa kontrollerat.',
    ],
    why: 'Aktiverar de djupa nackflexorerna, som avlastar de överaktiva ytliga musklerna — en evidensbaserad kärnövning, bäst i kombination med stretching (inte isolerat).',
  },
  {
    id: 'forearm-stretch',
    region: 'forearm',
    name: 'Underarmsstretch, flexor + extensor',
    dose: '20 sek/riktning',
    estimatedSeconds: 40,
    instructions: [
      'Sträck fram armen, handflatan uppåt, dra fingrarna/handen bakåt med andra handen (flexor).',
      'Vänd handflatan neråt, dra handen nedåt/inåt (extensor).',
      'Håll varje riktning, andas lugnt.',
    ],
    why: 'Direkt riktat mot musarm/RSI-besvär i underarmen.',
  },
  {
    id: 'posterior-foam-roller-calf',
    region: 'posterior_chain',
    name: 'Foam roller vader',
    dose: '60 sek/sida',
    estimatedSeconds: 120,
    instructions: [
      'Sitt med vaden på rullen, händer i golvet bakom dig för att styra trycket.',
      'Rulla långsamt från knäveck till häl.',
      'Stanna extra på ömma punkter i några andetag.',
    ],
    why: 'Systematiska översikter visar konsekvent kortsiktig ökning av rörlighet och minskad upplevd muskelspänning — jämförbart med lätt stretch/massage, troligen mer en neurologisk effekt (minskad muskeltonus) än mekanisk "upplösning".',
  },
  {
    id: 'posterior-calf-stretch',
    region: 'posterior_chain',
    name: 'Vadstretch mot vägg',
    dose: '30 sek/sida',
    estimatedSeconds: 60,
    instructions: [
      'Händerna mot väggen, ena benet bakom det andra, bakre hälen i golvet.',
      'Luta höften framåt mot väggen tills stretch känns i vaden på det bakre benet.',
      'Håll, byt sida.',
    ],
    why: 'Klassisk stretch för vadmuskulaturen, relevant vid vadspänning/hälbesvär.',
  },
  {
    id: 'posterior-child-pose',
    region: 'posterior_chain',
    name: "Barnets position",
    dose: '60 sek',
    estimatedSeconds: 60,
    instructions: [
      'Sitt på hälarna, luta överkroppen framåt, armarna sträckta framför dig i golvet.',
      'Låt pannan vila mot golvet/en kudde, andas lugnt in i ryggen.',
      'Håll och slappna av helt.',
    ],
    why: 'Avslutande, avslappnande position som sträcker hela ryggen och bäcknet efter passet.',
  },
]

export function exercisesForRegions(regions: Region[]): Exercise[] {
  const set = new Set(regions)
  return REGION_ORDER.flatMap(region =>
    set.has(region) ? EXERCISES.filter(e => e.region === region) : []
  )
}

export function totalEstimatedSeconds(exercises: Exercise[]): number {
  return exercises.reduce((sum, e) => sum + e.estimatedSeconds, 0)
}
