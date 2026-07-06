// iNaturalist Computer Vision API -- same technique Seek uses, free, no API
// key. Called server-side only (from app/api/identify/route.ts), never
// directly from the client, so there's one place to log/cache/rate-limit
// from if that's ever needed.

export interface IdentifyResult {
  commonName: string;
  scientificName: string;
}

// Test-only escape hatch: swaps out ONLY the external iNaturalist network
// call for a fixed, deterministic result. Everything downstream (rarity
// lookup, storage upload, DB insert, leaderboard aggregation) still runs
// for real against the test Supabase project -- this never affects
// production behavior since the env var is only set in playwright.config.ts's
// webServer block, never in a real deploy.
const MOCK_SPECIES: IdentifyResult = {
  commonName: "Blåmes",
  scientificName: "Cyanistes caeruleus",
};

export async function identifyBird(imageBytes: Buffer, mimeType: string): Promise<IdentifyResult> {
  if (process.env.BIRDSPOT_MOCK_AI === "1") {
    return MOCK_SPECIES;
  }

  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(imageBytes)], { type: mimeType }), "photo.jpg");

  const res = await fetch("https://api.inaturalist.org/v1/computervision/score_image", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`iNaturalist svarade med fel (HTTP ${res.status}).`);
  }

  const body = await res.json();
  const top = body?.results?.[0]?.taxon;
  if (!top) throw new Error("iNaturalist kunde inte identifiera en art på bilden.");

  return {
    commonName: top.preferred_common_name || top.name,
    scientificName: top.name,
  };
}
