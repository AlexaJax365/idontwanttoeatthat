// /api/googleSearchRestaurants.js
export default async function handler(req, res) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });

    const {
      latitude,
      longitude,
      location = "New York",
      accepted = "",
      limit = "24",
      radius = "8000",
      maxRadius = "32000",     // ~20 miles cap
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
    const base = Number(radius) || 8000;
    const cap = Number(maxRadius) || 32000;

    const radii = [base, 16000, 24000, 32000].filter(r => r <= cap);

    let all = [];
    let usedRadius = radii[0];

    for (const r of radii) {
      usedRadius = r;
      let results = [];

      if (hasCoords) {
        if (acceptedList.length) {
          results = await probeKeywordsNearby(apiKey, lat, lon, r, acceptedList, attempts);
        } else {
          const url = nearbyUrl(apiKey, lat, lon, r);
          const json = await safeFetchJson(url);
          attempts.push({ step: `nearby-${r}`, status: json.status, results: json.results?.length || 0 });
          results = (json.results || []).filter(onlyRestaurants);
        }
      } else {
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

      // de-dupe by place_id
      const map = new Map();
      for (const p of results) map.set(p.place_id, p);
      all = Array.from(map.values());

      // filter to accepted cuisines at this radius (if provided)
      if (acceptedList.length) {
        all = all.filter(p => matchesAccepted(p, acceptedList));
      }

      // ensure photos for the first ~16 items that lack one
      if (all.length) {
        const withPhotos = await ensurePhotos(apiKey, all, 16, attempts);
        all = withPhotos;
      }

      if (all.length >= Number(limit)) break;
    }

    const payload = {
      restaurants: all.slice(0, Number(limit)).map(slimPlace),
      usedRadius
    };
    if (debug === "1") payload.attempts = attempts;

    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).json(payload);
  } catch (e) {
    console.error("googleSearchRestaurants error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
}

/* helpers (same as we used earlier) */
function onlyRestaurants(p){ const t=(p?.types||[]).map(x=>String(x||"").toLowerCase()); return t.includes("restaurant"); }
function matchesAccepted(place, acceptedList){
  const types=(place?.types||[]).map(t=>String(t||"").toLowerCase());
  const typeHit=types.some(t=> t.endsWith("_restaurant") && acceptedList.includes(t.replace(/_restaurant$/,"").replace(/_/g," ")));
  const name=`${place?.name||""} ${place?.vicinity||""}`.toLowerCase();
  const kwHit=acceptedList.some(acc=>name.includes(acc));
  return typeHit || kwHit;
}
function slimPlace(p){
  return {
    place_id: p.place_id,
    name: p.name,
    rating: p.rating,
    user_ratings_total: p.user_ratings_total,
    vicinity: p.vicinity,
    price_level: p.price_level,
    types: p.types,
    photo_reference: p.photos?.[0]?.photo_reference || p._photo_reference || null,
    maps_url: p.place_id ? `https://www.google.com/maps/place/?q=place_id:${p.place_id}` : undefined
  };
}
function nearbyUrl(key,lat,lon,radius,pageToken){
  const p=new URLSearchParams({ key, location:`${lat},${lon}`, radius:String(radius), type:"restaurant" });
  if(pageToken) p.set("pagetoken",pageToken);
  return `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${p}`;
}
async function probeKeywordsNearby(key,lat,lon,radius,keywords,attempts){
  const bag=new Map();
  for(const kw of keywords){
    const p=new URLSearchParams({ key, location:`${lat},${lon}`, radius:String(radius), type:"restaurant", keyword:String(kw) });
    const url=`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${p}`;
    const json=await safeFetchJson(url);
    attempts?.push({ step:`nearby-${radius}-kw:${kw}`, status: json.status, results: json.results?.length || 0 });
    for(const r of (json.results||[])) if(onlyRestaurants(r)) bag.set(r.place_id,r);
  }
  return Array.from(bag.values());
}
async function ensurePhotos(apiKey, places, maxDetails=16, attempts){
  const out=[]; let count=0;
  for(const p of places){
    if(p.photos?.[0]?.photo_reference){ out.push(p); continue; }
    if(count>=maxDetails || !p.place_id){ out.push(p); continue; }
    const d=await fetchDetailsPhotoOnly(apiKey, p.place_id);
    attempts?.push({ step:`details-photo:${p.place_id}`, status:d.status, hasPhoto:!!d.photo_reference });
    out.push(d.photo_reference ? { ...p, _photo_reference: d.photo_reference } : p);
    count++;
  }
  return out;
}
async function fetchDetailsPhotoOnly(key, placeId){
  const params=new URLSearchParams({ key, place_id: placeId, fields: "photo" });
  const url=`https://maps.googleapis.com/maps/api/place/details/json?${params}`;
  const json=await safeFetchJson(url);
  const ref=json?.result?.photos?.[0]?.photo_reference || null;
  return { status: json?.status || "UNKNOWN", photo_reference: ref };
}
function textUrl(key,q){ const p=new URLSearchParams({ key, query:q, type:"restaurant" }); return `https://maps.googleapis.com/maps/api/place/textsearch/json?${p}`; }
async function safeFetchJson(url){ try{ const r=await fetch(url,{cache:"no-store"}); return await r.json(); }catch{ return { status:"FETCH_ERROR", results:[] }; } }
