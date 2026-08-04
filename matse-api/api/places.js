// Thin proxy in front of Foursquare Places — keeps the API key server-side
// only (per the Mat & Se spec, section 4: "Dölja API-nycklar från klienten").
// The client (poc/mat-och-se.html, served from GitHub Pages) calls this
// endpoint instead of Foursquare directly.
//
// Only ever requests "core" (free) fields — name, location, categories.
// Deliberately never requests `rating`: that field is gated behind
// Foursquare's paid credits on this account (confirmed directly against
// their API), and Daniel's call was to run without ratings for now rather
// than add billing. If that changes later, add 'rating' to FIELDS below —
// nothing else needs to change.

const FIELDS = 'name,location,categories,geocodes';
const ALLOWED_ORIGINS = new Set([
  'https://daniel83larsson-alt.github.io',
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

  const { lat, lng, radius, categories, limit } = req.query;
  if (!lat || !lng) {
    res.status(400).json({ error: 'lat and lng are required' });
    return;
  }

  const params = new URLSearchParams({
    ll: `${lat},${lng}`,
    radius: String(Math.min(Number(radius) || 20000, 100000)),
    limit: String(Math.min(Number(limit) || 20, 50)),
    fields: FIELDS,
  });
  if (categories) params.set('categories', String(categories));

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
