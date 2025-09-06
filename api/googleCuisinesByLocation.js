// /api/googleCuisinesByLocation.js
export default async function handler(req, res) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });

    const { latitude, longitude, location = "New York", radius = 8000 } = req.query;

    const attemptsLog = [];
    let placesCollected = [];
    let usedRadius = Number(radius) || 8000;

    // A) Nearby attempts (8km → 16km → 32km)
    if (latitude && longitude) {
      for (const r of [8000, 16000, 32000]) {
        usedRadius = r;
        const url = nearbyUrl(apiKey, latitude, longitude, r);
        const json = await safeFetchJson(url);
        attemptsLog.push({ step: `nearby-${r}`, status: json.status, results: json.results?.length || 0, error_message: json.error_message });
        if (Array.isArray(json.results)) placesCollected.push(...json.results);

        const cuisinesNow = extractCuisinesDynamic(placesCollected);
        if (cuisinesNow.length >= 8) return sendPayload(res, placesCollected, cuisinesNow, attemptsLog, usedRadius);
      }
    }

    // B) Text search fallback (force restaurant type via query)
    {
      const url = textUrl(apiKey, `restaurants in ${location}`);
      const json = await safeFetchJson(url);
      attemptsLog.push({ step: "textsearch", status: json.status, results: json.results?.length || 0, error_message: json.error_message });
      if (Array.isArray(json.results)) placesCollected.push(...json.results);
    }

    const cuisines = extractCuisinesDynamic(placesCollected);
    return sendPayload(res, placesCollected, cuisines, attemptsLog, usedRadius);
  } catch (e) {
    console.error("googleCuisines error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
}

function sendPayload(res, placesCollected, cuisines, attempts, usedRadius) {
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(200).json({
    cuisines,                    // dynamic array of cuisine labels
    attempts,                    // what each Google call returned
    sampleTypes: topTypes(placesCollected), // top raw Google types
    usedRadius
  });
}

function nearbyUrl(key, lat, lon, radius) {
  const p = new URLSearchParams({
    key,
    location: `${lat},${lon}`,
    radius: String(radius),
    type: "restaurant" // constrain to restaurants
  });
  return `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${p}`;
}

function textUrl(key, query) {
  const p = new URLSearchParams({ key, query, type: "restaurant" });
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

/**
 * Dynamic extraction:
 *  1) Only consider places that include type "restaurant".
 *  2) Read Google "types" (when they include cuisine-ish tokens).
 *  3) Also infer cuisine from name keywords (small, necessary mapping).
 */
function extractCuisinesDynamic(places) {
  const GENERIC = new Set([
    "restaurant","food","meal_takeaway","meal_delivery",
    "point_of_interest","establishment","store",
    "bar","cafe","bakery","lodging","night_club",
    "gym","health","spa","grocery_or_supermarket"
  ]);

  // Minimal keyword→cuisine mapping (disclosed necessity due to missing Google cuisine types)
  const KEYWORDS = [
    // Japanese
    { rx: /\bjapanese\b|\bsushi\b|\bramen\b|\bizakaya\b|\byakitori\b|\budon\b|\bsoba\b/i, label: "Japanese" },
    // Korean
    { rx: /\bkorean\b|\bbulgogi\b|\bbibimbap\b|\bkbbq\b/i, label: "Korean" },
    // Chinese
    { rx: /\bchinese\b|\bdim sum\b|\bsichuan\b|\bhunan\b|\bcantonese\b|\bhot pot\b/i, label: "Chinese" },
    // Thai
    { rx: /\bthai\b|\bpad thai\b|\btom( )?yum\b|\bgreen curry\b/i, label: "Thai" },
    // Vietnamese
    { rx: /\bvietnamese\b|\bpho\b|\bbanh? mi\b|\bbun\b/i, label: "Vietnamese" },
    // Indian
    { rx: /\bindian\b|\bbiryani\b|\bdosa\b|\btandoor/i, label: "Indian" },
    // Italian
    { rx: /\bitalian\b|\bpizza\b|\bpasta\b|\btrattoria\b|\bosteria\b/i, label: "Italian" },
    // Mexican
    { rx: /\bmexican\b|\btaqueria\b|\btaco\b|\bal pastor\b|\bbirria\b/i, label: "Mexican" },
    // Mediterranean / Middle Eastern
    { rx: /\bmediterranean\b|\bgreek\b|\bgyro\b|\bshawarma\b|\bkebab\b|\bfalafel\b|\bturkish\b|\blebanese\b/i, label: "Mediterranean" },
    // American/Burgers/BBQ
    { rx: /\bamerican\b|\bburger\b|\bdiner\b|\bbbq\b|\bsmokehouse\b/i, label: "American" },
    // Others (add lightweight signals)
    { rx: /\bethiopian\b|\binjera\b/i, label: "Ethiopian" },
    { rx: /\blebanese\b|\bmezze\b/i, label: "Lebanese" },
    { rx: /\bperuvian\b|\bceviche\b/i, label: "Peruvian" },
    { rx: /\bjamaican\b|\bjerk\b/i, label: "Jamaican" },
    { rx: /\bcaribbean\b/i, label: "Caribbean" },
    { rx: /\bfrench\b|\bbistro\b/i, label: "French" },
    { rx: /\bspanish\b|\btapas\b/i, label: "Spanish" },
    { rx: /\bgerman\b|\bbratwurst\b/i, label: "German" }
  ];

  const out = new Set();

  for (const p of places) {
    const types = (p?.types || []).map(t => String(t || "").toLowerCase());
    if (!types.includes("restaurant")) continue; // only restaurants

    // 1) Types-based tokens (rarely present, but keep if non-generic and non-shop/store)
    for (const t of types) {
      if (!t || GENERIC.has(t)) continue;
      if (t.startsWith("meal_")) continue;
      if (t.endsWith("_shop") || t.endsWith("_store")) continue;
      let label = t.endsWith("_restaurant") ? t.replace(/_restaurant$/, "") : t;
      label = label.replace(/_/g, " ").trim();
      if (label) out.add(titleCase(label));
    }

    // 2) Name-based hints (needed in many regions; keeps list dynamic to local names)
    const name = String(p?.name || "");
    if (name) {
      for (const { rx, label } of KEYWORDS) {
        if (rx.test(name)) out.add(label);
      }
    }
  }

  return Array.from(out).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function topTypes(places) {
  const counts = {};
  for (const p of places) for (const t of (p?.types || [])) counts[t] = (counts[t] || 0) + 1;
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([type,count])=>({ type, count }));
}

function titleCase(s) { return s.replace(/\b\w/g, c => c.toUpperCase()); }
