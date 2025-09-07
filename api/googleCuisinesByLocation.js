// /api/googleCuisinesByLocation.js
export default async function handler(req, res) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });

    const {
      latitude,
      longitude,
      location = "New York",
      radius = 8000,
      minLabels = 12,
      mode = "fast",          // "fast" (1 page per radius) or "deep" (paginate & more radii)
      maxPages = 3,
      debug = "0"
    } = req.query;

    const attemptsLog = [];
    let placesCollected = [];
    let usedRadius = Number(radius) || 8000;

    const lat = latitude != null ? parseFloat(latitude) : null;
    const lon = longitude != null ? parseFloat(longitude) : null;
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

    const radii = mode === "deep"
      ? [8000, 16000, 32000, 50000, 80000]
      : [Number(radius) || 8000, 16000, 32000];

    // 1) Nearby attempts (coords only)
    if (hasCoords) {
      for (const r of radii) {
        usedRadius = r;
        const pageResults = (mode === "deep")
          ? await fetchNearbyAllPages({ apiKey, lat, lon, radius: r, maxPages: Number(maxPages) })
          : await fetchNearbyOnePage({ apiKey, lat, lon, radius: r });

        attemptsLog.push({ step: `nearby-${r}`, pages: pageResults.pages, total: pageResults.items.length, status: "OK" });
        placesCollected.push(...pageResults.items.filter(onlyRestaurants));

        const cuisinesNow = extractCuisinesStrict(placesCollected);
        if (cuisinesNow.length >= Number(minLabels)) {
          return sendPayload(res, placesCollected, cuisinesNow, attemptsLog, usedRadius, debug === "1");
        }
      }
    } else {
      attemptsLog.push({ step: "nearby-skip", status: "NO_COORDS", results: 0 });
    }

    // 2) Text Search fallback (by city name)
    {
      const url = textUrl(apiKey, `restaurants in ${location}`);
      const json = await safeFetchJson(url);
      attemptsLog.push({ step: "textsearch", status: json.status, results: json.results?.length || 0, error_message: json.error_message });
      if (Array.isArray(json.results)) placesCollected.push(...json.results.filter(onlyRestaurants));
    }

    // 3) Extract cuisines (STRICT: only *_restaurant + name keywords)
    let cuisines = extractCuisinesStrict(placesCollected);

    // 4) Enrichment sweep if still short: probe likely cuisine keywords;
    //    keep only those that return restaurants at your coords/radius.
    if (cuisines.length < Number(minLabels)) {
      const extra = await enrichmentSweep({
        apiKey,
        lat, lon, hasCoords, location,
        usedRadius,
        already: new Set(cuisines),
        needAtLeast: Number(minLabels) - cuisines.length
      });
      cuisines = sortLabels([...cuisines, ...extra]);
    }

    return sendPayload(res, placesCollected, cuisines, attemptsLog, usedRadius, debug === "1");
  } catch (e) {
    console.error("googleCuisines error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
}

function sendPayload(res, placesCollected, cuisines, attempts, usedRadius, includeDebug) {
  res.setHeader("Cache-Control", "public, max-age=60");
  const payload = { cuisines, usedRadius };
  if (includeDebug) {
    payload.attempts = attempts;
    payload.sampleTypes = topTypes(placesCollected);
  }
  return res.status(200).json(payload);
}

/* ---------------- Core helpers ---------------- */

function onlyRestaurants(p) {
  const types = (p?.types || []).map(t => String(t || "").toLowerCase());
  return types.includes("restaurant"); // gate: only actual restaurants
}

function sortLabels(arr) {
  return Array.from(new Set(arr.map(x => String(x).trim()).filter(Boolean)))
    .sort((a,b)=>a.localeCompare(b, undefined, {sensitivity:"base"}));
}

function titleCase(s) { return s.replace(/\b\w/g, c => c.toUpperCase()); }

function nearbyUrl(key, lat, lon, radius, pageToken) {
  const p = new URLSearchParams({
    key, location: `${lat},${lon}`, radius: String(radius), type: "restaurant"
  });
  if (pageToken) p.set("pagetoken", pageToken);
  return `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${p}`;
}
function nearbyUrlKeyword(key, lat, lon, radius, keyword) {
  const p = new URLSearchParams({
    key, location: `${lat},${lon}`, radius: String(radius), type: "restaurant", keyword: String(keyword)
  });
  return `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${p}`;
}
function textUrl(key, query) {
  const p = new URLSearchParams({ key, query, type: "restaurant" });
  return `https://maps.googleapis.com/maps/api/place/textsearch/json?${p}`;
}
async function safeFetchJson(url) {
  try { const r = await fetch(url, { cache: "no-store" }); return await r.json(); }
  catch { return { status: "FETCH_ERROR", results: [] }; }
}
async function fetchNearbyOnePage({ apiKey, lat, lon, radius }) {
  const url = nearbyUrl(apiKey, lat, lon, radius);
  const json = await safeFetchJson(url);
  return { pages: 1, items: Array.isArray(json.results) ? json.results : [] };
}
async function fetchNearbyAllPages({ apiKey, lat, lon, radius, maxPages = 3 }) {
  let items = [];
  let token = null;
  let pages = 0;
  for (let i = 0; i < maxPages; i++) {
    const url = nearbyUrl(apiKey, lat, lon, radius, token);
    const json = await safeFetchJson(url);
    pages++;
    if (Array.isArray(json.results)) items.push(...json.results);
    if (!json.next_page_token) break;
    token = json.next_page_token;
    await wait(2000);
  }
  return { pages, items };
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function topTypes(places) {
  const counts = {};
  for (const p of places) for (const t of (p?.types || [])) counts[t] = (counts[t] || 0) + 1;
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([type,count])=>({ type, count }));
}

/* ---------------- STRICT extraction & Enrichment ---------------- */

/**
 * STRICT extractor:
 *  - From `types`: only labels derived from *_restaurant (e.g., japanese_restaurant → Japanese)
 *  - From names/vicinity: cuisine keyword patterns (e.g., sushi/ramen → Japanese)
 *  - Never promotes venue types (casino, art_gallery, movie_theater, etc.)
 */
function extractCuisinesStrict(places) {
  const out = new Set();

  // From types like "japanese_restaurant" → "Japanese"
  for (const p of places) {
    const types = p?.types || [];
    for (const tRaw of types) {
      const t = String(tRaw || "").toLowerCase();
      if (!t.endsWith("_restaurant")) continue; // STRICT: only cuisine*_restaurant
      const label = titleCase(t.replace(/_restaurant$/, "").replace(/_/g, " ").trim());
      if (label) out.add(label);
    }
  }

  // From names/vicinity signals
  const nameMap = [
    { rx: /\bjapanese\b|\bsushi\b|\bramen\b|\bizakaya\b|\byakitori\b|\btempura\b/i, label: "Japanese" },
    { rx: /\bkorean\b|\bbulgogi\b|\bbibimbap\b|\bkbbq\b/i, label: "Korean" },
    { rx: /\bchinese\b|\bdim sum\b|\bsichuan\b|\bhunan\b|\bcantonese\b|\bhot[ -]?pot\b/i, label: "Chinese" },
    { rx: /\bthai\b|\bpad thai\b|\btom\s?yum\b|\bgreen curry\b/i, label: "Thai" },
    { rx: /\bvietnamese\b|\bpho\b|\bbanh?\s?mi\b|\bbún\b/i, label: "Vietnamese" },
    { rx: /\bindian\b|\bbiryani\b|\bdosa\b|\btandoor|\btikka|\bmasala\b/i, label: "Indian" },
    { rx: /\bmexican\b|\btaqueria\b|\btaco\b|\bal pastor\b|\bbirria\b/i, label: "Mexican" },
    { rx: /\bitalian\b|\bpizza\b|\bpasta\b|\btrattoria\b|\bosteria\b/i, label: "Italian" },
    { rx: /\bfrench\b|\bbistro\b|\bbrasserie\b/i, label: "French" },
    { rx: /\bspanish\b|\btapas\b/i, label: "Spanish" },
    { rx: /\bethiopian\b|\binjera\b/i, label: "Ethiopian" },
    { rx: /\bperuvian\b|\bceviche\b|\bpollo a la brasa\b/i, label: "Peruvian" },
    { rx: /\bjamaican\b|\bjerk\b/i, label: "Jamaican" },
    { rx: /\bcaribbean\b/i, label: "Caribbean" },
    { rx: /\bgreek\b|\bgyro\b|\bspanakopita\b/i, label: "Greek" },
    { rx: /\bturkish\b/i, label: "Turkish" },
    { rx: /\blebanese\b|\bmezze\b/i, label: "Lebanese" },
    { rx: /\bamerican\b|\bdiner\b/i, label: "American" },
    { rx: /\bburger(s)?\b/i, label: "Burgers" },
    { rx: /\bbbq\b|\bbar-?b-?q\b|\bbarbecue\b/i, label: "BBQ" },
    { rx: /\bsea ?food\b|\boyster\b/i, label: "Seafood" },
    { rx: /\bsandwich(es)?\b|\bdeli\b/i, label: "Sandwiches" },
    { rx: /\bsteakhouse\b|\bsteak\b/i, label: "Steakhouse" },
    { rx: /\bnoodle(s)?\b/i, label: "Noodles" },
    { rx: /\bramen\b/i, label: "Ramen" },
    { rx: /\bsushi\b/i, label: "Sushi" },
    { rx: /\bpizza\b/i, label: "Pizza" },
    { rx: /\btapas\b/i, label: "Tapas" }
  ];

  for (const p of places) {
    const text = `${p?.name || ""} ${p?.vicinity || ""}`;
    for (const { rx, label } of nameMap) {
      if (rx.test(text)) out.add(label);
    }
  }

  return sortLabels([...out]);
}

/**
 * Probe likely cuisine keywords and keep only those that return restaurants nearby.
 * Still dynamic (no UI curation), because we only keep keywords with real matches now.
 */
async function enrichmentSweep({ apiKey, lat, lon, hasCoords, location, usedRadius, already, needAtLeast }) {
  // Try to derive candidates from the places we saw (restrict to *_restaurant only)
  const derived = new Set();
  // (we could mine more, but the strict extractor already did that; keep probes small)
  const fallbackSeeds = [
    "Japanese","Korean","Chinese","Thai","Vietnamese","Indian",
    "Mexican","Italian","French","Spanish","Mediterranean",
    "Greek","Turkish","Lebanese","Ethiopian","Peruvian",
    "Caribbean","Jamaican","American","BBQ","Seafood","Burgers",
    "Pizza","Sandwiches","Steakhouse","Ramen","Sushi","Noodles","Tapas"
  ];

  const candidates = Array.from(new Set([...derived, ...fallbackSeeds]))
    .filter(c => !already.has(c));

  const results = [];
  const maxProbes = Math.min(candidates.length, needAtLeast + 12);

  for (let i = 0; i < maxProbes; i++) {
    const kw = candidates[i];
    let items = [];
    if (hasCoords) {
      const url = nearbyUrlKeyword(apiKey, lat, lon, usedRadius, kw);
      const json = await safeFetchJson(url);
      if (Array.isArray(json.results)) items = json.results.filter(onlyRestaurants);
    } else {
      const url = textUrl(apiKey, `${kw} restaurants in ${location}`);
      const json = await safeFetchJson(url);
      if (Array.isArray(json.results)) items = json.results.filter(onlyRestaurants);
    }
    if (items.length > 0) results.push(kw);
    if (results.length >= needAtLeast) break;
  }

  return results;
}


