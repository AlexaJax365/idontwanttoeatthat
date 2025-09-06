// /api/googleCuisinesByLocation.js
export default async function handler(req, res) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });

    const { latitude, longitude, location = "New York", radius = 8000, minLabels = 8 } = req.query;

    const attemptsLog = [];
    let placesCollected = [];
    let usedRadius = Number(radius) || 8000;

    const lat = latitude != null ? parseFloat(latitude) : null;
    const lon = longitude != null ? parseFloat(longitude) : null;
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

    // Nearby attempts (only if coords are valid)
    if (hasCoords) {
      for (const r of [8000, 16000, 32000]) {
        usedRadius = r;
        const url = nearbyUrl(apiKey, lat, lon, r);
        const json = await safeFetchJson(url);
        attemptsLog.push({ step: `nearby-${r}`, status: json.status, results: json.results?.length || 0, error_message: json.error_message });

        if (Array.isArray(json.results)) {
          // keep ONLY restaurants
          placesCollected.push(...json.results.filter(onlyRestaurants));
        }
        const cuisinesNow = extractCuisinesDynamic(placesCollected);
        if (cuisinesNow.length >= Number(minLabels)) return sendPayload(res, placesCollected, cuisinesNow, attemptsLog, usedRadius);
      }
    } else {
      attemptsLog.push({ step: "nearby-skip", status: "NO_COORDS", results: 0 });
    }

    // Text Search fallback (then hard-filter to restaurants)
    {
      const url = textUrl(apiKey, `restaurants in ${location}`);
      const json = await safeFetchJson(url);
      attemptsLog.push({ step: "textsearch", status: json.status, results: json.results?.length || 0, error_message: json.error_message });
      if (Array.isArray(json.results)) placesCollected.push(...json.results.filter(onlyRestaurants));
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
    cuisines, attempts, sampleTypes: topTypes(placesCollected), usedRadius
  });
}

function onlyRestaurants(p) {
  const types = (p?.types || []).map(t => String(t || "").toLowerCase());
  return types.includes("restaurant");
}

function nearbyUrl(key, lat, lon, radius) {
  const p = new URLSearchParams({
    key, location: `${lat},${lon}`, radius: String(radius), type: "restaurant"
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

/** Types + name/vicinity keywords; final scrub avoids non-food labels */
function extractCuisinesDynamic(places) {
  const GENERIC_TYPES = new Set([
    "restaurant","food","meal_takeaway","meal_delivery","point_of_interest","establishment",
    "store","bar","cafe","bakery","lodging","night_club","gym","health","spa",
    "grocery_or_supermarket","liquor_store"
  ]);

  const NOISE_LABELS = [
    /alley/i, /wash/i, /car/i, /auto/i, /gas/i, /station/i, /gym/i, /spa/i, /health/i,
    /store/i, /shop/i, /market/i, /mall/i, /salon/i, /beauty/i, /pharmacy/i, /laundry/i,
    /lodging/i, /hotel/i, /motel/i, /night club/i
  ];

  const KEYWORDS = [
    { rx: /\bjapanese\b|\bsushi\b|\bramen\b|\bizakaya\b|\byakitori\b|\btempura\b/i, label: "Japanese" },
    { rx: /\bkorean\b|\bbulgogi\b|\bbibimbap\b|\bkbbq\b/i, label: "Korean" },
    { rx: /\bchinese\b|\bdim sum\b|\bsichuan\b|\bhunan\b|\bcantonese\b|\bhot[ -]?pot\b/i, label: "Chinese" },
    { rx: /\bthai\b|\bpad thai\b|\btom\s?yum\b|\bgreen curry\b/i, label: "Thai" },
    { rx: /\bvietnamese\b|\bpho\b|\bbanh?\s?mi\b|\bbún\b/i, label: "Vietnamese" },
    { rx: /\bindian\b|\bbiryani\b|\bdosa\b|\btandoor|\btikka|\bmasala\b/i, label: "Indian" },
    { rx: /\bmediterranean\b|\bgreek\b|\bgyro\b|\bshawarma\b|\bkebab\b|\bmezze\b|\blebanese\b|\bturkish\b/i, label: "Mediterranean" },
    { rx: /\bmexican\b|\btaqueria\b|\btaco\b|\bal pastor\b|\bbirria\b/i, label: "Mexican" },
    { rx: /\bitalian\b|\bpizza\b|\bpasta\b|\btrattoria\b|\bosteria\b/i, label: "Italian" },
    { rx: /\bfrench\b|\bbistro\b|\bbrasserie\b/i, label: "French" },
    { rx: /\bspanish\b|\btapas\b/i, label: "Spanish" },
    { rx: /\bethiopian\b|\binjera\b/i, label: "Ethiopian" },
    { rx: /\bperuvian\b|\bceviche\b|\bpollo a la brasa\b/i, label: "Peruvian" },
    { rx: /\bjamaican\b|\bjerk\b/i, label: "Jamaican" },
    { rx: /\bcaribbean\b/i, label: "Caribbean" },
    { rx: /\bamerican\b|\bdiner\b/i, label: "American" },
    { rx: /\bburger\b/i, label: "Burgers" },
    { rx: /\bbbq\b|\bbar-?b-?q\b|\bbarbecue\b/i, label: "BBQ" },
    { rx: /\bsea ?food\b|\boyster\b/i, label: "Seafood" },
    { rx: /\bsandwich(es)?\b|\bdeli\b/i, label: "Sandwiches" }
  ];

  const out = new Set();

  for (const p of places) {
    const types = (p?.types || []).map(t => String(t || "").toLowerCase());
    if (!types.includes("restaurant")) continue; // hard gate = no gas/car wash/gyms

    // types-based
    for (const t of types) {
      if (!t || GENERIC_TYPES.has(t)) continue;
      if (t.startsWith("meal_")) continue;
      if (t.endsWith("_shop") || t.endsWith("_store")) continue;
      let label = t.endsWith("_restaurant") ? t.replace(/_restaurant$/, "") : t;
      label = label.replace(/_/g, " ").trim();
      if (label && !NOISE_LABELS.some(rx => rx.test(label))) out.add(titleCase(label));
    }

    // name + vicinity hints
    const nameVic = `${p?.name || ""} ${p?.vicinity || ""}`;
    if (nameVic) for (const { rx, label } of KEYWORDS) if (rx.test(nameVic)) out.add(label);
  }

  return Array.from(out).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function topTypes(places) {
  const counts = {};
  for (const p of places) for (const t of (p?.types || [])) counts[t] = (counts[t] || 0) + 1;
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([type,count])=>({ type, count }));
}
function titleCase(s) { return s.replace(/\b\w/g, c => c.toUpperCase()); }
