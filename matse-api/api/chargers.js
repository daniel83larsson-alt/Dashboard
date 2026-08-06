// Thin proxy in front of NOBIL (nobil.no) — keeps the API key server-side
// only, same reasoning as api/places.js. The client calls this endpoint
// with a bounding box instead of calling NOBIL directly.
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

  const key = process.env.NOBIL_KEY;
  if (!key) {
    res.status(500).json({ error: 'NOBIL_KEY not configured' });
    return;
  }

  const { north, south, east, west, limit } = req.query;
  if (!north || !south || !east || !west) {
    res.status(400).json({ error: 'north, south, east and west are required' });
    return;
  }

  const params = new URLSearchParams({
    apikey: key,
    apiversion: '3',
    action: 'search',
    type: 'rectangle',
    northeast: `(${north},${east})`,
    southwest: `(${south},${west})`,
    format: 'json',
    limit: String(Math.min(Number(limit) || 100, 200)),
  });

  try {
    const nobilRes = await fetch(`https://nobil.no/api/server/search.php?${params}`);
    const data = await nobilRes.json();
    if (!nobilRes.ok || data.error) {
      res.status(nobilRes.ok ? 502 : nobilRes.status).json({ error: data.error || 'NOBIL request failed' });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Upstream request failed: ' + err.message });
  }
};
