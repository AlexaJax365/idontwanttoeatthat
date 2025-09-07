// /api/googleSearchRestaurants.js
export default async function handler(req, res) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });

    const {
      latitude,
      longitude,
      location = "New York",
      accepted = "",          // comma-separated cuisine labels (e.g., "Japanese,Thai")
      limit = "24",
      maxMiles = "10",        // keep it close by default
      expand = "0",           // if "1", we allow growing maxMiles until we find matches (up to 50)
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
    const hardCapMiles = 50; // never exceed ~50 mi
    let miles = clamp(Number(maxMiles) || 10, 1, hardCapMiles);

    let all = [];
    let usedMiles = miles;

    // Helper to run a single pass at a given max miles
    const runOnce = async (m) => {
      // We use rankby=distance so Google gives nearest first; we then cut by m miles.
      let results = [];
      if (hasCoords) {
        if (acceptedList.length) {
          results = await probeKeywordsDistanceRank(apiKey, lat, lon, acceptedList, attempts);
        } else {
          const json = await nearbyRankDistance(apiKey, lat, lon);
          attempts.push({ step: `nearby-rank-distance`, status: json.status, results: json.results?.length || 0 });
          results = (json.results || []).filter(onlyRestaurants);
        }
      } else {
        // Fallback to text search by city if no coords
        if (acceptedList.length) {
          results = [];
          for (const kw of acceptedList) {
            const u = textUrl(apiKey, `${kw} restaurants in ${location}`);
            const j = await safeFetchJson(u);
            attempts.push({ step: `text-${kw}`, status: j.status, results: j.results?.length || 0 });
            results.push(...(j.results || []).filter(onlyRestaurants));
          }
        } else {
          const u = textUrl(apiKey, `restaurants in ${location}`);
          const j = await safeFetchJson(u);
          attempts.push({ step: `text-generic`, status: j.status, results: j.results?.length || 0 });
          results = (j.results || []).filter(onlyRestaurants);
        }
      }

      // de-dupe by place_id
      const map = new Map();
      for (const p of results) map.set(p.place_id, p);
      let unique = Array.from(map.values());

      // filter to accepted cuisines (if provided)
      if (acceptedList.length) unique = unique.filter(p => matchesAccepted(p, acceptedList));

      // keep only within m miles (when we have geometry)
      if (hasCoords) {
        unique = unique.filter(p => {
          const g = p.geometry?.location;
          if (!g) return true; // if no geometry, keep it (rare)
          const dMeters = haversineMeters(lat, lon, g.lat, g.lng);
          return dMeters <= milesToMeters(m);
        });
      }

      // Make sure we have some photos
      if (unique.length) unique = await ensurePhotos(apiKey, unique, 16, attempts);

      return unique;
    };

    // Try once with the requested miles
    all = await runOnce(miles);

    // If still empty and expand requested, grow miles in steps until we find something or hit 50
    if ((!all || all.length === 0) && expand === "1") {
      const steps = [15, 20, 30, 40, 50].filter(v => v > miles);
      for (const m of steps) {
        usedMiles = m;
        all = await runOnce(m);
        if (all.length) break;
      }
    } else {
      usedMiles = miles;
    }

    // Compose payload
    const tooFar = usedMiles > 20; // warn >20 miles
    const payload = {
      restaurants: (all || []).slice(0, Number(limit)).map(slimPlace),
      usedMiles,
      warning: tooFar ? "We had to look farther than ~20 miles to find matches." : undefined
    };
    if (debug === "1") payload.attempts = attempts;

    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).json(payload);
  } catch (e) {
    console.error("googleSearchRestaurants error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
}

/* ---------- helpers ---------- */

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
function milesToMeters(mi){ return mi * 1609.344; }

function onlyRestaurants(p){
  const t=(p?.types||[]).map(x=>String(x||"").toLowerCase());
  return t.includes("restaurant");
}

function matchesAccepted(place, acceptedList){
  const types=(place?.types||[]).map(t=>String(t||"").toLowerCase());
  const typeHit=types.some(t=> t.endsWith("_restaurant") &&
    acceptedList.includes(t.replace(/_restaurant$/,"").replace(/_/g," ")));
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
    // ⬇️ add coordinates for distance calc
    geo: {
      lat: p.geometry?.location?.lat ?? null,
      lng: p.geometry?.location?.lng ?? null,
    },
    photo_reference: p.photos?.[0]?.photo_reference || p._photo_reference || null,
    maps_url: p.place_id ? `https://www.google.com/maps/place/?q=place_id:${p.place_id}` : undefined
  };
}


function haversineMeters(lat1, lon1, lat2, lon2){
  const toRad = v => (v*Math.PI)/180;
  const R = 6371000;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
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

async function nearbyRankDistance(key, lat, lon, pageToken){
  // rankby=distance must NOT include radius
  const p=new URLSearchParams({ key, location:`${lat},${lon}`, rankby:"distance", type:"restaurant" });
  if(pageToken) p.set("pagetoken", pageToken);
  const url=`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${p}`;
  return await safeFetchJson(url);
}

async function probeKeywordsDistanceRank(key, lat, lon, keywords, attempts){
  // For each keyword, use rankby=distance (no radius), collect a couple pages.
  const bag=new Map();
  for(const kw of keywords){
    let token=null; let pages=0;
    for(let i=0;i<2;i++){ // grab up to 2 pages per kw
      const p=new URLSearchParams({ key, location:`${lat},${lon}`, rankby:"distance", type:"restaurant", keyword:String(kw) });
      if(token) p.set("pagetoken", token);
      const url=`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${p}`;
      const json=await safeFetchJson(url);
      attempts?.push({ step:`nearby-rank-distance:${kw}`, page: pages+1, status: json.status, results: json.results?.length || 0 });
      for(const r of (json.results||[])) if(onlyRestaurants(r)) bag.set(r.place_id, r);
      pages++;
      if(!json.next_page_token) break;
      token=json.next_page_token;
      await wait(2000);
    }
  }
  return Array.from(bag.values());
}

function textUrl(key,q){ const p=new URLSearchParams({ key, query:q, type:"restaurant" }); return `https://maps.googleapis.com/maps/api/place/textsearch/json?${p}`; }
async function safeFetchJson(url){ try{ const r=await fetch(url,{cache:"no-store"}); return await r.json(); }catch{ return { status:"FETCH_ERROR", results:[] }; } }
function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
