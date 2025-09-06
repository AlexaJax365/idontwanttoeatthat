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
      minLabels = 8
    } = req.query;

    const attemptsLog = [];
    let placesCollected = [];
    let usedRadius = Number(radius) || 8000;

    // Nearby attempts (8km → 16km → 32km)
    if (latitude && longitude) {
      for (const r of [8000, 16000, 32000]) {
        usedRadius = r;
        const url = nearbyUrl(apiKey, latitude, longitude, r);
        const json = await safeFetchJson(url);
        attemptsLog.push({ step: `nearby-${r}`, status: json.status, results: json.results?.length || 0, error_message: json.error_message });

        if (Array.isArray(json.results)) placesCollected.push(...json.results);

        const cuisinesNow = extractCuisinesDynamic(placesCollected);
        if (cuisinesNow.length >= Number(minLabels)) {
          return sendPayload(res, placesCollected, cuisinesNow, attemptsLog, usedRadius);
        }
      }
    }

    // Text Search fallback (still restaurants)
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
    cuisines,                    // dynamic set of inferred cuisines
    attempts,                    // what each call returned
    sampleTypes: topTypes(placesCollected),
    usedRadius
  });
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
 * Dynamic cuisine extraction
 *  - Only from places that include "restaurant"
 *  - Use Google types when non-generic
 *  - Infer from name/vicinity with compact keyword map (kept general, not a fixed UI list)
 */
function extractCuisinesDynamic(places) {
  const GENERIC = new Set([
    "restaurant","food","meal_takeaway","meal_delivery",
    "point_of_interest","establishment","store",
    "bar","cafe","bakery","lodging","night_club",
    "gym","health","spa","grocery_or_supermarket"
  ]);

  // Broader—but still compact—signals.
  // (This exists because Google often doesn't provide cuisine subtypes in `types`.)
  const KEYWORDS = [
    // East Asian
    { rx: /\bjapanese\b|\bsushi\b|\bramen\b|\bizakaya\b|\byakitori\b|\btempura\b/i, label: "Japanese" },
    { rx: /\bkorean\b|\bbulgogi\b|\bbibimbap\b|\bkbbq\b/i, label: "Korean" },
    { rx: /\bchinese\b|\bdim sum\b|\bsichuan\b|\bhunan\b|\bcantonese\b|\bhot[ -]?pot\b/i, label: "Chinese" },
    // SE Asian
    { rx: /\bthai\b|\bpad thai\b|\btom\s?yum\b|\bgreen curry\b/i, label: "Thai" },
    { rx: /\bvietnamese\b|\bpho\b|\bbanh?\s?mi\b|\bbún\b/i, label: "Vietnamese" },
    // South Asian
    { rx: /\bindian\b|\bbiryani\b|\bdosa\b|\btandoor|\btikka|\bmasala\b/i, label: "Indian" },
    // Mediterranean / Middle Eastern
    { rx: /\bmediterranean\b|\bgreek\b|\bgyro\b|\bshawarma\b|\bkebab\b|\bmezze\b|\blebanese\b|\bturkish\b|\bisraeli\b|\bpalestinian\b/i, label: "Mediterranean" },
    // Latin American
    { rx: /\bmexican\b|\btaqueria\b|\btaco\b|\bal pastor\b|\bbirria\b/i, label: "Mexican" },
    { rx: /\bperuvian\b|\bceviche\b|\bpollo a la brasa\b/i, label: "Peruvian" },
    { rx: /\bbrazilian\b|\bchurrasc(o|aria)\b/i, label: "Brazilian" },
    { rx: /\bargentin(e|ian)\b|\bparrilla\b/i, label: "Argentinian" },
    { rx: /\bcolombian\b|\barepa\b/i, label: "Colombian" },
    { rx: /\bsalvadoran\b|\bpupus[ae]\b/i, label: "Salvadoran" },
    { rx: /\bcuban\b|\bcubano\b/i, label: "Cuban" },
    { rx: /\bdominican\b/i, label: "Dominican" },
    { rx: /\bpuerto rican\b|\bmofongo\b/i, label: "Puerto Rican" },
    { rx: /\bjamaican\b|\bjerk\b/i, label: "Jamaican" },
    { rx: /\bcaribbean\b/i, label: "Caribbean" },
    // European
    { rx: /\bitalian\b|\bpizza\b|\bpasta\b|\btrattoria\b|\bosteria\b/i, label: "Italian" },
    { rx: /\bfrench\b|\bbistro\b|\bbrasserie\b/i, label: "French" },
    { rx: /\bspanish\b|\btapas\b/i, label: "Spanish" },
    { rx: /\bportuguese\b|\bbacalhau\b|\bfrancesinha\b/i, label: "Portuguese" },
    { rx: /\bgerman\b|\bbratwurst\b|\bschnitzel\b/i, label: "German" },
    { rx: /\bpolish\b|\bpierogi\b/i, label: "Polish" },
    // African
    { rx: /\bethiopian\b|\binjera\b/i, label: "Ethiopian" },
    { rx: /\bmoroccan\b|\btagine\b/i, label: "Moroccan" },
    { rx: /\bnigerian\b|\bjollof\b/i, label: "Nigerian" },
    // General American / others
    { rx: /\bamerican\b|\bdiner\b/i, label: "American" },
    { rx: /\bburger\b/i, label: "Burgers" },
    { rx: /\bbbq\b|\bbar-?b-?q\b|\bbarbecue\b/i, label: "BBQ" },
    { rx: /\bsea ?food\b|\boyster\b|\bsushi\b/i, label: "Seafood" }, // sushi overlaps, but OK
    { rx: /\bsandwich(es)?\b|\bdeli\b/i, label: "Sandwiches" }
  ];

  const out = new Set();

  for (const p of places) {
    const types = (p?.types || []).map(t => String(t || "").toLowerCase());
    if (!types.includes("restaurant")) continue;

    // 1) Types-based, when not generic/store/shop
    for (const t of types) {
      if (!t || GENERIC.has(t)) continue;
      if (t.startsWith("meal_")) continue;
      if (t.endsWith("_shop") || t.endsWith("_store")) continue;
      let label = t.endsWith("_restaurant") ? t.replace(/_restaurant$/, "") : t;
      label = label.replace(/_/g, " ").trim();
      if (label) out.add(titleCase(label));
    }

    // 2) Name/vicinity hints (essential in areas with generic Google types)
    const name = `${p?.name || ""} ${p?.vicinity || ""}`;
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