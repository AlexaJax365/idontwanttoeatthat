// /api/googleSearchRestaurants.js
export default async function handler(req, res) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });

    const {
      latitude,
      longitude,
      location = "New York",
      accepted = "",      // comma-separated cuisine labels (e.g., "Japanese,Thai")
      limit = "20",
      radius = "8000",    // start ~5 miles
      debug = "0"
    } = req.query;

    const lat = latitude != null ? parseFloat(latitude) : null;
    const lon = longitude != null ? parseFloat(longitude) : null;
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

    const acceptedList = String(accepted)
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    const attempts = [];
    const radii = [Number(radius) || 8000, 16000, 32000, 50000, 80000, 120000]; // up to ~75 mi

    let all = [];
    let usedRadius = radii[0];

    for (const r of radii) {
      usedRadius = r;
      let results = [];

      if (hasCoords) {
        // If we have accepted cuisines, probe each as a keyword; otherwise generic nearby search
        if (acceptedList.length) {
          results = await probeKeywordsNearby(apiKey, lat, lon, r, acceptedList);
        } else {
          const url = nearbyUrl(apiKey, lat, lon, r);
          const json = await safeFetchJson(url);
          attempts.push({ step: `nearby-${r}`, status: json.status, results: json.results?.length || 0 });
          results = (json.results || []).filter(onlyRestaurants);
        }
      } else {
        // Fallback to text search
        if (acceptedList.length) {
          results = [];
          for (const kw of acceptedList) {
            const url = textUrl(apiKey, `${kw} restaurants in ${location}`);
            const json = await safeFetchJson(url);
            attempts.push({ step: `text-${kw}`, status: json.status, results: json.results?.length || 0 });
            results.push(...(json.results || []).filter(onlyRestaurants));
          }
        } else {
          const url = textUrl(apiKey, `restaurants in ${location}`);
          const json = await safeFetchJson(url);
          attempts.push({ step: "text-generic", status: json.status, results: json.results?.length || 0 });
          results = (json.results || []).filter(onlyRestaurants);
        }
      }

      // De-dupe by place_id
      const map = new Map();
      for (const p of results) map.set(p.place_id, p);
      all = Array.from(map.values());

      // If we specifically asked for cuisines, keep those that match ANY accepted
      if (acceptedList.length) {
        all = all.filter(p => matchesAccepted(p, acceptedList));
      }

      if (all.length >= Number(limit)) break; // good enough; stop expanding
    }

    const tooFar = usedRadius > 80000; // > ~50 miles
    const payload = {
      restaurants: all.slice(0, Number(limit)).map(slimPlace),
      usedRadius,
      warning: tooFar ? "The search radius exceeded ~50 miles to find results." : undefined
    };

    if (debug === "1") payload.attempts = attempts;

    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).json(payload);
  } catch (e) {
    console.error("googleSearchRestaurants error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
}

/* ---------------- helpers ---------------- */

function onlyRestaurants(p) {
  const types = (p?.types || []).map(t => String(t || "").toLowerCase());
  return types.includes("restaurant");
}
function matchesAccepted(place, acceptedList) {
  const types = (place?.types || []).map(t => String(t || "").toLowerCase());
  const name = `${place?.name || ""} ${place?.vicinity || ""}`.toLowerCase();

  // Any of the restaurant's types includes <cuisine>_restaurant
  const typeHit = types.some(t => {
    if (!t.endsWith("_restaurant")) return false;
    const label = t.replace(/_restaurant$/, "").replace(/_/g, " ");
    return acceptedList.includes(label);
  });

  // Or keyword hit in name/vicinity
  const kwHit = acceptedList.some(acc => name.includes(acc));

  return typeHit || kwHit;
}
function slimPlace(p) {
  return {
    place_id: p.place_id,
    name: p.name,
    rating: p.rating,
    user_ratings_total: p.user_ratings_total,
    vicinity: p.vicinity,
    price_level: p.price_level,
    types: p.types,
    // Prefer the first photo
    photo_reference: p.photos?.[0]?.photo_reference || null,
    maps_url: p.place_id ? `https://www.google.com/maps/place/?q=place_id:${p.place_id}` : undefined
  };
}
function nearbyUrl(key, lat, lon, radius, pageToken) {
  const p = new URLSearchParams({
    key, location: `${lat},${lon}`, radius: String(radius), type: "restaurant"
  });
  if (pageToken) p.set("pagetoken", pageToken);
  return `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${p}`;
}
async function probeKeywordsNearby(key, lat, lon, radius, keywords) {
  const bag = new Map();
  for (const kw of keywords) {
    const p = new URLSearchParams({
      key,
      location: `${lat},${lon}`,
      radius: String(radius),
      type: "restaurant",
      keyword: String(kw)
    });
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${p}`;
    const json = await safeFetchJson(url);
    for (const r of (json.results || [])) {
      if (onlyRestaurants(r)) bag.set(r.place_id, r);
    }
  }
  return Array.from(bag.values());
}
function textUrl(key, query) {
  const p = new URLSearchParams({ key, query, type: "restaurant" });
  return `https://maps.googleapis.com/maps/api/place/textsearch/json?${p}`;
}
async function safeFetchJson(url) {
  try { const r = await fetch(url, { cache: "no-store" }); return await r.json(); }
  catch { return { status: "FETCH_ERROR", results: [] }; }
}
