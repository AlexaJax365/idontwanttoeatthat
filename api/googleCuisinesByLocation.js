// /api/googleCuisinesByLocation.js
export default async function handler(req, res) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });

    const { latitude, longitude, location = "New York", radius = 1500, maxPages = 3 } = req.query;

    let cuisines = [];
    let usedRadius = Number(radius) || 1500;

    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);

      // Expand if we find very few cuisines
      const radiusSteps = [usedRadius, 4000, 8000, 12000];
      for (const r of radiusSteps) {
        usedRadius = r;
        const results = await fetchAllNearbyPages({
          apiKey,
          location: `${lat},${lon}`,
          radius: r,
          type: "restaurant",
          maxPages: Number(maxPages) || 3,
        });

        cuisines = extractCuisineLabels(results);
        if (cuisines.length >= 8) break; // good enough
      }

      res.setHeader("Cache-Control", "public, max-age=60");
      return res.status(200).json({ cuisines, usedRadius });
    }

    // Text Search fallback by city name
    const textParams = new URLSearchParams({
      key: apiKey,
      query: `restaurants in ${location}`,
    });
    const resp = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${textParams}`);
    const json = await resp.json();

    if (json.status && json.status !== "OK") {
      console.warn("Places Text Search status:", json.status, json.error_message);
    }

    cuisines = extractCuisineLabels(json.results || []);
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).json({ cuisines, usedRadius: null });
  } catch (e) {
    console.error("googleCuisines error:", e);
    res.status(500).json({ error: "Failed to fetch cuisines" });
  }
}

/**
 * Fetch up to N pages from Nearby Search.
 * Google returns ~20 results per page, with next_page_token that becomes valid ~2s later.
 */
async function fetchAllNearbyPages({ apiKey, location, radius, type = "restaurant", maxPages = 3 }) {
  const all = [];
  let pageToken = null;

  for (let i = 0; i < maxPages; i++) {
    const params = new URLSearchParams({
      key: apiKey,
      location,
      type,
      radius: String(radius), // using rankby=prominence semantics; radius is allowed
    });

    if (pageToken) params.set("pagetoken", pageToken);

    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`;
    const resp = await fetch(url);
    const json = await resp.json();

    // Log & handle non-OK statuses gracefully
    if (json.status && json.status !== "OK") {
      // "INVALID_REQUEST" sometimes means pagetoken not ready yet; back off and retry this iteration
      if (json.status === "INVALID_REQUEST" && pageToken) {
        await wait(2000);
        i--; // retry same page
        continue;
      }
      if (json.status === "OVER_QUERY_LIMIT") {
        console.warn("Places Nearby OVER_QUERY_LIMIT; backing off.");
        await wait(1500);
      } else if (json.status !== "ZERO_RESULTS") {
        console.warn("Places Nearby status:", json.status, json.error_message);
      }
    }

    if (Array.isArray(json.results)) {
      all.push(...json.results);
    }

    if (!json.next_page_token) break;
    pageToken = json.next_page_token;

    // Google says wait ~2s before next_page_token is valid
    await wait(2000);
  }

  return all;
}

function extractCuisineLabels(results) {
  const set = new Set();
  for (const place of results) {
    const types = place?.types || [];
    for (const t of types) {
      // match "<cuisine>_restaurant"
      const m = t.match(/^(.+)_restaurant$/);
      if (m && m[1] && !m[1].includes("meal")) {
        const pretty = titleCase(m[1].replace(/_/g, " ").trim());
        if (pretty) set.add(pretty);
      }
    }
  }
  // Return a stable, user-friendly list
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function titleCase(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
