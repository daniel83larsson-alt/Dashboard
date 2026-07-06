import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { identifyBird } from "@/lib/inaturalist";

const DEFAULT_RARITY_SCORE = 5;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Ingen bild bifogad." }, { status: 400 });
  }

  let identified;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    identified = await identifyBird(buffer, file.type || "image/jpeg");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI-identifieringen misslyckades." },
      { status: 502 }
    );
  }

  const { data: rarityMatch } = await supabase
    .from("birdspot_species_rarity")
    .select("id, common_name, rarity_score")
    .ilike("scientific_name", identified.scientificName)
    .maybeSingle();

  const scoreAwarded = rarityMatch?.rarity_score ?? DEFAULT_RARITY_SCORE;

  // photo_url stores the storage PATH (bucket is private) -- signed URLs are
  // generated on read, same pattern as elsewhere in this repo.
  const storagePath = `${user.id}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("birdspot-photos")
    .upload(storagePath, file, { contentType: file.type || "image/jpeg" });
  if (uploadError) {
    return NextResponse.json({ error: "Kunde inte spara fotot." }, { status: 500 });
  }

  const speciesName = rarityMatch?.common_name || identified.commonName;

  const { data: sighting, error: insertError } = await supabase
    .from("birdspot_sightings")
    .insert({
      user_id: user.id,
      species_rarity_id: rarityMatch?.id ?? null,
      species_name: speciesName,
      photo_url: storagePath,
      score_awarded: scoreAwarded,
    })
    .select("*")
    .single();

  if (insertError || !sighting) {
    return NextResponse.json({ error: "Kunde inte spara fyndet." }, { status: 500 });
  }

  const { data: signed } = await supabase.storage
    .from("birdspot-photos")
    .createSignedUrl(storagePath, 60 * 60);

  return NextResponse.json({
    sighting: {
      ...sighting,
      photo_signed_url: signed?.signedUrl ?? null,
    },
  });
}
