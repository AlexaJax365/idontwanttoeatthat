// /api/googleSearchRestaurants.js
export default async function handler(req, res) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });

    const { latitude, longitude, location = "New York", radius = 4000, cuisine = "" } = req.query;

    const lat = latitude != null ? parseFloat(latitude) : null;
    const lon = longitude != null ? parseFloat(longitude) : null;
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

    const keywords = (cuisine || "").trim();
    if (!keywords) return res.status(400).json({ error: "Missing cuisine keyword" });

    // try 4km → 8km → 16km → 32km → 50km
    const radii = [4000, 8000, 16000, 32000, 50000];
    let found = [];

    for (const r of radii) {
      if (hasCoords) {
        const url = nearbyUrl(apiKey, lat, lon, r, keywords);
        const json = await safeFetchJson(url);
        const items = (json.results || []).filter(onlyRestaurants);
        found = items;
      } else {
        const url = textUrl(apiKey, `${keywords} restaurants in ${location}`);
        const json = await safeFetchJson(url);
        const items = (json.results || []).filter(onlyRestaurants);
        found = items;
      }
      if (found.length > 0) {
        return res.status(200).json({
          restaurants: normalize(found),
          usedRadius: r,
          radiusWarning: r > 80000 ? "Search radius exceeded 50 miles" : undefined
        });
      }
    }

    // still none:
    return res.status(200).json({ restaurants: [], usedRadius: radii[radii.length - 1], radiusWarning: "No matches within 50km+" });
  } catch (e) {
    console.error("googleSearchRestaurants error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
}

function onlyRestaurants(p) {
  const types = (p?.types || []).map(t => String(t || "").toLowerCase());
  return types.includes("restaurant");
}

function nearbyUrl(key, lat, lon, radius, keyword) {
  const p = new URLSearchParams({
    key, location: `${lat},${lon}`, radius: String(radius), type: "restaurant", keyword
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
function normalize(items) {
  return items.map(x => ({
    id: x.place_id,
    name: x.name,
    address: x.vicinity || x.formatted_address || "",
    rating: x.rating,
    userRatingsTotal: x.user_ratings_total,
    photoRef: x.photos?.[0]?.photo_reference,
    types: x.types || [],
    url: `https://www.google.com/maps/place/?q=place_id:${x.place_id}`
  }));
}
