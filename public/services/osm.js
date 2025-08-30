// server/osm.js
// OSM-only helper endpoints: Overpass proxy with in-memory cache (+ optional Nominatim reverse proxy)
// Usage: import osmRouter from './osm.js'; app.use('/api/osm', osmRouter);
// Requires: npm i express node-fetch cors

import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

// --- Config (env) ---
const OVERPASS_ENDPOINT = process.env.OVERPASS_ENDPOINT || 'https://overpass-api.de/api/interpreter';
const NOMINATIM_REVERSE = process.env.NOMINATIM_REVERSE || 'https://nominatim.openstreetmap.org/reverse';
const CACHE_TTL_MS      = +(process.env.OSM_CACHE_TTL_MS || 120000); // 2 minutes
const MAX_RADIUS        = +(process.env.OSM_MAX_RADIUS || 5000);
const MIN_RADIUS        = +(process.env.OSM_MIN_RADIUS || 200);
const APP_USER_AGENT    = process.env.APP_USER_AGENT || 'FoodFindGo/1.0 (contact: you@example.com)';

// --- Tiny in-memory cache ---
const cache = new Map(); // key -> { exp:number, data:any }
const getCache = (k) => {
  const v = cache.get(k);
  if (!v) return null;
  if (Date.now() > v.exp) { cache.delete(k); return null; }
  return v.data;
};
const setCache = (k, data, ttl = CACHE_TTL_MS) => cache.set(k, { exp: Date.now() + ttl, data });

// --- Helpers ---
function cuisineRegex(hint) {
  if (!hint) return '';
  const safe = String(hint).toLowerCase().replace(/[^a-z|]/g, '');
  return safe ? `["cuisine"~"${safe}",i]` : '';
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function buildOverpassQL({ lat, lng, radius, cuisine='', amenity='restaurant|fast_food|cafe' }) {
  const cuisineFilter = cuisineRegex(cuisine);
  return `[out:json][timeout:25];
    (
      node["amenity"~"${amenity}"]${cuisineFilter}(around:${radius},${lat},${lng});
      way["amenity"~"${amenity}"]${cuisineFilter}(around:${radius},${lat},${lng});
      relation["amenity"~"${amenity}"]${cuisineFilter}(around:${radius},${lat},${lng});
    );
    out center 40;`;
}

async function overpassQuery(ql) {
  const r = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': APP_USER_AGENT
    },
    body: new URLSearchParams({ data: ql })
  });
  if (!r.ok) {
    const text = await r.text();
    const err = new Error(`Overpass HTTP ${r.status}`);
    err.status = r.status;
    err.detail = text.slice(0, 1024);
    throw err;
  }
  return r.json();
}

// --- Routes ---

// Health check
router.get('/_health', (req, res) => {
  res.json({ ok: true, overpass: OVERPASS_ENDPOINT, cache_size: cache.size });
});

// Nearby POIs (amenity = restaurant|fast_food|cafe by default)
// GET /api/osm/nearby?lat=..&lng=..&radius=2500&cuisine=noodle|thai&amenity=restaurant|cafe
router.get('/nearby', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat,lng required' });
  const radius = clamp(+(req.query.radius || 2500), MIN_RADIUS, MAX_RADIUS);
  const cuisine = req.query.cuisine || '';
  const amenity = req.query.amenity || 'restaurant|fast_food|cafe';

  const ql = buildOverpassQL({ lat, lng, radius, cuisine, amenity });
  const key = `nearby:${lat},${lng}:${radius}:${cuisine}:${amenity}`;

  const cached = getCache(key);
  if (cached) return res.json(cached);

  try {
    const json = await overpassQuery(ql);
    setCache(key, json);
    res.json(json);
  } catch (e) {
    res.status(e.status || 502).json({ error: 'Overpass failure', detail: e.detail || String(e) });
  }
});

// Optional: Nominatim reverse proxy (for consistent UA & rate control)
// GET /api/osm/reverse?lat=..&lng=..&zoom=18&lang=th
router.get('/reverse', async (req, res) => {
  const { lat, lng, zoom = 18, lang = 'th,en' } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat,lng required' });

  const u = new URL(NOMINATIM_REVERSE);
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('lat', lat);
  u.searchParams.set('lon', lng);
  u.searchParams.set('zoom', String(zoom));
  u.searchParams.set('addressdetails', '1');
  u.searchParams.set('accept-language', String(lang));

  const key = `rev:${u.search}`;
  const cached = getCache(key);
  if (cached) return res.json(cached);

  try {
    const r = await fetch(u.toString(), { headers: { 'User-Agent': APP_USER_AGENT, 'Accept': 'application/json' } });
    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ error: 'Nominatim failure', detail: t.slice(0, 1024) });
    }
    const json = await r.json();
    setCache(key, json, CACHE_TTL_MS);
    res.json(json);
  } catch (e) {
    res.status(502).json({ error: 'Nominatim unreachable', detail: String(e) });
  }
});

export default router;
