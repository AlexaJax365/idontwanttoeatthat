// /api/googleCuisinesByLocation.js
export default async function handler(req, res) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });

    const { latitude, longitude, location = "New York", radius = 1500 } = req.query;

    const params = new URLSearchParams({
      key: apiKey,
      type: "restaurant",
      rankby: "prominence",
      radius: String(radius),
    });

    if (latitude && longitude) {
      params.set("location", `${latitude},${longitude}`);
    } else {
      // fallback via Text Search if no lat/lon
      const textParams = new URLSearchParams({
        key: apiKey,
        query: `restaurants in ${location}`,
      });
      const resp = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${textParams}`);
      const json = await resp.json();
      const cuisines = extractCuisineLabels(json.results || []);
      return res.status(200).json(cuisines);
    }

    const resp = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`);
    const json = await resp.json();
    const cuisines = extractCuisineLabels(json.results || []);
    return res.status(200).json(cuisines);
  } catch (e) {
    console.error("googleCuisines error:", e);
    res.status(500).json({ error: "Failed to fetch cuisines" });
  }
}

function extractCuisineLabels(results) {
  const set = new Set();
  results.forEach(place => {
    (place.types || []).forEach(t => {
      // match "<cuisine>_restaurant"
      const m = t.match(/^(.+)_restaurant$/);
      if (m && m[1] && !m[1].includes("meal")) {
        set.add(titleCase(m[1].replace(/_/g, " ")));
      }
    });
  });
  return Array.from(set);
}

function titleCase(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}
