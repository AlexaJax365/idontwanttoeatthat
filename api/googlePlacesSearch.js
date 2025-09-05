// /api/googlePlacesSearch.js
export default async function handler(req, res) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });

    const {
      latitude,
      longitude,
      location = "New York",
      limit = 40,
      accepted = "",       // comma-separated cuisines (labels like "Korean","Japanese")
    } = req.query;

    const acceptedList = (accepted || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    // radius steps in meters (1km -> 120km)
    const radiusSteps = [1000, 2000, 5000, 10000, 20000, 40000, 80000, 120000];

    let places = [];
    let usedRadius = radiusSteps[0];

    for (const r of radiusSteps) {
      usedRadius = r;
      // If we have accepted cuisines, query each cuisine, merging results
      if (acceptedList.length) {
        const all = await Promise.all(
          acceptedList.map(cui => fetchNearby({
            apiKey, latitude, longitude, location, radius: r,
            keyword: `${cui} restaurant`
          }))
        );
        places = mergePlaces(all.flat());
      } else {
        // Generic restaurant search
        places = await fetchNearby({ apiKey, latitude, longitude, location, radius: r, keyword: "restaurant" });
      }

      if (places.length) break;
    }

    // compute max distance and prepare normalized payload
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    let maxDistanceMeters = 0;

    const businesses = places.slice(0, Number(limit)).map(p => {
      const distance = (lat && lon && p.geometry?.location)
        ? haversine(lat, lon, p.geometry.location.lat, p.geometry.location.lng)
        : undefined;

      if (distance && distance > maxDistanceMeters) maxDistanceMeters = distance;

      return {
        name: p.name,
        url: `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
        image_url: p.photos?.[0]?.photo_reference
          ? `/api/googlePhoto?ref=${encodeURIComponent(p.photos[0].photo_reference)}&maxwidth=600`
          : null,
        location: { address1: p.vicinity || p.formatted_address || "" },
        rating: p.rating,
        user_ratings_total: p.user_ratings_total,
        distance_meters: distance,
      };
    });

    const warning = (maxDistanceMeters > 80467) ? "⚠ Some results are more than 50 miles away." : "";

    res.status(200).json({ businesses, warning, usedRadius });
  } catch (e) {
    console.error("googlePlacesSearch error:", e);
    res.status(500).json({ error: "Failed to fetch places" });
  }
}

async function fetchNearby({ apiKey, latitude, longitude, location, radius, keyword }) {
  const params = new URLSearchParams({ key: apiKey, keyword, radius: String(radius), type: "restaurant" });

  if (latitude && longitude) {
    params.set("location", `${latitude},${longitude}`);
  } else {
    // Text Search fallback if no geolocation
    const tp = new URLSearchParams({ key: apiKey, query: `${keyword} in ${location}` });
    const tr = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${tp}`);
    const tj = await tr.json();
    return tj.results || [];
  }

  const resp = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`);
  const json = await resp.json();
  return json.results || [];
}

function mergePlaces(list) {
  const seen = new Set();
  const out = [];
  for (const p of list) {
    if (!seen.has(p.place_id)) {
      seen.add(p.place_id);
      out.push(p);
    }
  }
  return out;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat/2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon/2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
