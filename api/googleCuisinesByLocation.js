// /api/googleCuisinesByLocation.js
export default async function handler(req, res) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });

    const {
      latitude,
      longitude,
      location = "New York",
      radius = 8000
    } = req.query;

    const attemptsLog = [];
    let placesCollected = [];
    let usedRadius = Number(radius) || 8000;

    // --- A) Nearby attempts (8km → 16km → 32km → 50km)
    if (latitude && longitude) {
      for (const r of [8000, 16000, 32000, 50000]) {
        usedRadius = r;
        const url = nearbyUrl(apiKey, latitude, longitude, r);
        const json = await safeFetchJson(url);
        attemptsLog.push({ step: `nearby-${r}`, status: json.status, results: json.results?.length || 0, error_message: json.error_message });
        if (Array.isArray(json.results)) placesCollected.push(...json.results);

        const cuisinesNow = extractCuisines(placesCollected);
        if (cuisinesNow.length >= 8) {
          const payload = payloadFrom(placesCollected, cuisinesNow, attemptsLog, usedRadius);
          res.setHeader("Cache-Control", "public, max-age=60");
          return res.status(200).json(payload);
        }
      }
    }

    // --- B) Text search fallback (city name)
    {
      const url = textUrl(apiKey, `restaurants in ${location}`);
      const json = await safeFetchJson(url);
      attemptsLog.push({ step: "textsearch", status: json.status, results: json.results?.length || 0, error_message: json.error_message });
      if (Array.isArray(json.results)) placesCollected.push(...json.results);
    }

    // Build final payload
    const cuisines = extractCuisines(placesCollected);
    const payload = payloadFrom(placesCollected, cuisines, attemptsLog, usedRadius);

    // If still empty, DO NOT force curated — return the debug so we can see what's wrong.
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).json(payload);
  } catch (e) {
    console.error("googleCuisines error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
}

function payloadFrom(placesCollected, cuisines, attempts, usedRadius) {
  return {
    cuisines,            // array of strings
    attempts,            // what each call returned
    sampleTypes: topTypes(placesCollected), // what types Google actually gave us
    usedRadius
  };
}

function nearbyUrl(key, lat, lon, radius) {
  const p = new URLSearchParams({
    key,
    location: `${lat},${lon}`,
    radius: String(radius),
    type: "restaurant"
  });
  return `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${p}`;
}

function textUrl(key, query) {
  const p = new URLSearchParams({ key, query });
  return `https://maps.googleapis.com/maps/api/place/textsearch/json?${p}`;
}

async function safeFetchJson(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return await r.json();
  } catch (e) {
    return { status: "FETCH_ERROR", results: [] };
  }
}

// Extract cuisines dynamically (types + light name hints) with minimal noise filtering
function extractCuisines(places) {
  const GENERIC = new Set([
    "restaurant","food","meal_takeaway","meal_delivery","bar","cafe","bakery",
    "point_of_interest","establishment","store","supermarket","grocery_or_supermarket",
    "liquor_store","pharmacy","gas_station","lodging","night_club","shopping_mall",
    "convenience_store","department_store"
  ]);

  const out = new Set();

  for (const p of places) {
    const types = p?.types || [];

    // Types-based
    for (const t of types) {
      const type = String(t || "").toLowerCase();
      if (!type || GENERIC.has(type)) continue;
      if (type.startsWith("meal_")) continue;
      if (type.endsWith("_shop") || type.endsWith("_store")) continue;

      let label = type.endsWith("_restaurant") ? type.replace(/_restaurant$/, "") : type;
      label = label.replace(/_/g, " ").trim();
      if (label) out.add(titleCase(label));
    }

    // Name-based hints only if types provide little
    if ((p?.types?.length || 0) < 2) {
      for (const h of pickCuisineWordsFromName(String(p?.name || ""))) {
        out.add(h);
      }
    }
  }

  return Array.from(out).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function pickCuisineWordsFromName(name) {
  const LOWER = name.toLowerCase();
  const hits = [];
  const patterns = [
    { rx: /\bjapanese\b|\bsushi\b|\bramen\b/, label: "Japanese" },
    { rx: /\bkorean\b/, label: "Korean" },
    { rx: /\bchinese\b|\bdim sum\b/, label: "Chinese" },
    { rx: /\bthai\b/, label: "Thai" },
    { rx: /\bvietnamese\b|\bpho\b|\bbahn? mi\b/, label: "Vietnamese" },
    { rx: /\bindian\b|\btandoor\b|\bmasala\b/, label: "Indian" },
    { rx: /\bmexican\b|\btaqueria\b|\btaco\b/, label: "Mexican" },
    { rx: /\bitalian\b|\bpizza\b|\bpasta\b/, label: "Italian" },
    { rx: /\bmediterranean\b|\bgreek\b|\bshawarma\b|\bgyro\b/, label: "Mediterranean" },
    { rx: /\bburger\b/, label: "Burgers" },
    { rx: /\bamerican\b/, label: "American" }
  ];
  for (const { rx, label } of patterns) {
    if (LOWER.match(rx)) hits.push(label);
  }
  return Array.from(new Set(hits));
}

function topTypes(places) {
  const counts = {};
  for (const p of places) {
    for (const t of (p?.types || [])) {
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a,b) => b[1]-a[1])
    .slice(0,30)
    .map(([type,count]) => ({ type, count }));
}

function titleCase(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}
