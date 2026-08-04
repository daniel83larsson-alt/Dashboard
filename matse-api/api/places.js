// Thin proxy in front of Foursquare Places — keeps the API key server-side
// only (per the Mat & Se spec, section 4: "Dölja API-nycklar från klienten").
// The client (poc/mat-och-se.html, served from GitHub Pages) calls this
// endpoint instead of Foursquare directly.
//
// Only ever requests "core" (free) fields. Deliberately never requests
// `rating`, `hours`, or `description` — all three are gated behind
// Foursquare's paid credits on this account (confirmed one field at a time
// directly against their API: link/website/tel/fsq_place_id are free, hours
// and description are not). Daniel's call was to run without ratings for
// now rather than add billing — same reasoning covers hours/description.
// website/tel are included for a "läs mer" link in the UI; note their own
// consumer place-detail page (foursquare.com/v/{id}) redirects to a login
// wall, so it's not used as a link target — website/tel or a generic map
// link are used instead, built client-side.
const FIELDS = 'name,latitude,longitude,location,categories,website,tel';
const ALLOWED_ORIGINS = new Set([
  'https://daniel83larsson-alt.github.io',
  'https://mat-och-se.vercel.app',
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Without this, the edge cache (see Cache-Control below) keys purely on
  // URL — two different allowed origins hitting the same lat/lng could get
  // served each other's cached Access-Control-Allow-Origin header, which
  // the browser would then reject client-side (mismatched origin), causing
  // confusing intermittent failures. Found live: an evil.example.com test
  // request got served mat-och-se.vercel.app's cached CORS header. Not an
  // actual data leak (the browser still enforces the header must match its
  // own origin), but a real correctness bug for legitimate origins.
  res.setHeader('Vary', 'Origin');
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const key = process.env.FOURSQUARE_KEY;
  if (!key) {
    res.status(500).json({ error: 'FOURSQUARE_KEY not configured' });
    return;
  }

  const { lat, lng, radius, query, limit } = req.query;
  if (!lat || !lng) {
    res.status(400).json({ error: 'lat and lng are required' });
    return;
  }

  // Free-text query (e.g. "restaurant", "attraction") rather than numeric
  // category IDs — tested both directly against Foursquare: the category-ID
  // taxonomy this account's plan exposes didn't line up with search results
  // (a restaurant category ID returned a castle and a grocery store), while
  // `query` matched cleanly on both restaurant- and sight-type searches.
  const params = new URLSearchParams({
    ll: `${lat},${lng}`,
    radius: String(Math.min(Number(radius) || 20000, 100000)),
    limit: String(Math.min(Number(limit) || 20, 50)),
    fields: FIELDS,
  });
  if (query) params.set('query', String(query));

  try {
    const fsqRes = await fetch(`https://places-api.foursquare.com/places/search?${params}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        'X-Places-Api-Version': '2025-06-17',
        Accept: 'application/json',
      },
    });
    const data = await fsqRes.json();
    if (!fsqRes.ok) {
      res.status(fsqRes.status).json({ error: data.message || 'Foursquare request failed' });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Upstream request failed: ' + err.message });
  }
};
