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

    // --- Nearby attempts (8km → 16km → 32km)
    if (latitude && longitude) {
      for (const r of [8000, 16000, 32000]) {
        usedRadius = r;
        const url = nearbyUrl(apiKey, latitude, longitude, r);
        const json = await safeFetchJson(url);
        attemptsLog.push({ step: `nearby-${r}`, status: json.status, results: json.results?.length || 0, error_message: json.error_message });
        if (Array.isArray(json.results)) placesCollected.push(...json.results);

        const cuisinesNow = extractCuisines(placesCollected);
        if (cuisinesNow.length >= 8) {
          return sendPayload(res, placesCollected, cuisinesNow, attemptsLog, usedRadius);
        }
      }
    }

    // --- Text search fallback (force restaurant type)
    {
      const url = textUrl(apiKey, `restaurants in ${location}`, /*typeRestaurant*/ true);
      const json = await safeFetchJson(url);
      attemptsLog.push({ step: "textsearch", status: json.status, results: json.results?.length || 0, error_message: json.error_message });
      if (Array.isArray(json.results)) placesCollected.push(...json.results);
    }

    const cuisines = extractCuisines(placesCollected);
    return sendPayload(res, placesCollected, cuisines, attemptsLog, usedRadius);
  } catch (e) {
    console.error("googleCuisines error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
}

function sendPayload(res, placesCollected, cuisines, attempts, usedRadius) {
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(200).json({
    cuisines,                 // dynamic array of cuisine labels
    attempts,                 // what Google returned at each step
    sampleTypes: topTypes(placesCollected), // top raw Google types (for debugging)
    usedRadius
  });
}

function nearbyUrl(key, lat, lon, radius) {
  const p = new URLSearchParams({
    key,
    location: `${lat},${lon}`,
    radius: String(radius),
    type: "restaurant"           // constrain to restaurants
  });
  return `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${p}`;
}

function textUrl(key, query, typeRestaurant = false) {
  const p = new URLSearchParams({ key, query });
  if (typeRestaurant) p.set("type", "restaurant");  // keep results food-focused
  return `https://maps.googleapis.com/maps/api/place/textsearch/json?${p}`;
}

async function safeFetchJson(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return await r.json();
  } catch {
    return { status: "FETCH_ERROR", results: [] };
  }
}

// Only extract cuisines from places that are actually restaurants
function extractCuisines(places) {
  const GENERIC = new Set([
    // global generics
    "restaurant","food","meal_takeaway","meal_delivery",
    "point_of_interest","establishment",
    // non-food venues / services we want to exclude
    "bowling_alley","car_wash","car_repair","car_dealer","car_rental","parking",
    "gym","spa","health","doctor","hospital","physiotherapist","pharmacy","dentist",
    "beauty_salon","hair_care",
    "store","supermarket","grocery_or_supermarket","convenience_store","department_store",
    "shopping_mall","clothing_store","shoe_store","jewelry_store","book_store",
    "electronics_store","home_goods_store","furniture_store","hardware_store",
    "laundry","bank","atm","post_office","police","school","university","library",
    "lodging","night_club","movie_theater","museum","zoo","park","stadium"
  ]);

  const out = new Set();

  for (const p of places) {
    const types = (p?.types || []).map(t => String(t || "").toLowerCase());
    if (!types.includes("restaurant")) continue; // 🚫 ignore non-restaurant POIs entirely

    // Types-based dynamic labels
    for (const tRaw of types) {
      if (!tRaw || GENERIC.has(tRaw)) continue;
      if (tRaw.startsWith("meal_")) continue;
      if (tRaw.endsWith("_shop") || tRaw.endsWith("_store")) continue;

      let label = tRaw.endsWith("_restaurant") ? tRaw.replace(/_restaurant$/, "") : tRaw;
      label = label.replace(/_/g, " ").trim();
      if (label) out.add(titleCase(label));
    }

    // Light name hints only if types were sparse
    if (types.length < 2 && p?.name) {
      for (const h of pickCuisineWordsFromName(String(p.name))) out.add(h);
    }
  }

  return Array.from(out).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function pickCuisineWordsFromName(name) {
  const lower = name.toLowerCase();
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
  for (const { rx, label } of patterns) if (lower.match(rx)) hits.push(label);
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
