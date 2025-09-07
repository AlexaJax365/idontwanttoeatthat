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
      minLabels = 12,
      mode = "deep",          // keep deep by default, but stop early
      maxPages = 3,
      maxRadius = 32000,      // ~20 miles default CAP
      debug = "0"
    } = req.query;

    const attemptsLog = [];
    let placesCollected = [];
    let usedRadius = Number(radius) || 8000;

    const lat = latitude != null ? parseFloat(latitude) : null;
    const lon = longitude != null ? parseFloat(longitude) : null;
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

    // Radii we’re willing to try, but never exceed maxRadius
    const rawRadii = mode === "deep"
      ? [8000, 16000, 24000, 32000, 50000, 80000]
      : [Number(radius) || 8000, 16000, 24000, 32000];

    const radii = rawRadii.filter(r => r <= Number(maxRadius));

    if (hasCoords) {
      for (const r of radii) {
        usedRadius = r;
        const pageResults = (mode === "deep")
          ? await fetchNearbyAllPages({ apiKey, lat, lon, radius: r, maxPages: Number(maxPages) })
          : await fetchNearbyOnePage({ apiKey, lat, lon, radius: r });

        attemptsLog.push({ step: `nearby-${r}`, pages: pageResults.pages, total: pageResults.items.length, status: "OK" });
        placesCollected.push(...pageResults.items.filter(onlyRestaurants));

        const cuisinesNow = extractCuisinesStrict(placesCollected);
        if (cuisinesNow.length >= Number(minLabels)) {
          return sendPayload(res, placesCollected, cuisinesNow, attemptsLog, usedRadius, debug === "1");
        }
      }
    } else {
      attemptsLog.push({ step: "nearby-skip", status: "NO_COORDS", results: 0 });
    }

    // Fallback Text Search (only if still short)
    {
      const url = textUrl(apiKey, `restaurants in ${location}`);
      const json = await safeFetchJson(url);
      attemptsLog.push({ step: "textsearch", status: json.status, results: json.results?.length || 0, error_message: json.error_message });
      if (Array.isArray(json.results)) placesCollected.push(...json.results.filter(onlyRestaurants));
    }

    let cuisines = extractCuisinesStrict(placesCollected);

    if (cuisines.length < Number(minLabels)) {
      const extra = await enrichmentSweep({
        apiKey,
        lat, lon, hasCoords, location,
        usedRadius,
        already: new Set(cuisines),
        needAtLeast: Number(minLabels) - cuisines.length
      });
      cuisines = sortLabels([...cuisines, ...extra]);
    }

    return sendPayload(res, placesCollected, cuisines, attemptsLog, usedRadius, debug === "1");
  } catch (e) {
    console.error("googleCuisines error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
}

function sendPayload(res, placesCollected, cuisines, attempts, usedRadius, includeDebug) {
  res.setHeader("Cache-Control", "public, max-age=60");
  const payload = { cuisines, usedRadius };
  if (includeDebug) {
    payload.attempts = attempts;
    payload.sampleTypes = topTypes(placesCollected);
  }
  return res.status(200).json(payload);
}

/* helpers from your latest version… (unchanged) */
function onlyRestaurants(p){ const t=(p?.types||[]).map(x=>String(x||"").toLowerCase()); return t.includes("restaurant"); }
function sortLabels(arr){ return Array.from(new Set(arr.map(x=>String(x).trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:"base"})); }
function titleCase(s){ return s.replace(/\b\w/g,c=>c.toUpperCase()); }
function nearbyUrl(key,lat,lon,r,pageToken){ const p=new URLSearchParams({key,location:`${lat},${lon}`,radius:String(r),type:"restaurant"}); if(pageToken)p.set("pagetoken",pageToken); return `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${p}`; }
function textUrl(key,q){ const p=new URLSearchParams({key,query:q,type:"restaurant"}); return `https://maps.googleapis.com/maps/api/place/textsearch/json?${p}`; }
async function safeFetchJson(u){ try{ const r=await fetch(u,{cache:"no-store"}); return await r.json(); }catch{ return {status:"FETCH_ERROR",results:[]}; } }
async function fetchNearbyOnePage({apiKey,lat,lon,radius}){ const u=nearbyUrl(apiKey,lat,lon,radius); const j=await safeFetchJson(u); return {pages:1,items:Array.isArray(j.results)?j.results:[]}; }
async function fetchNearbyAllPages({apiKey,lat,lon,radius,maxPages=3}){ let items=[],token=null,pages=0; for(let i=0;i<maxPages;i++){ const u=nearbyUrl(apiKey,lat,lon,radius,token); const j=await safeFetchJson(u); pages++; if(Array.isArray(j.results)) items.push(...j.results); if(!j.next_page_token) break; token=j.next_page_token; await wait(2000);} return {pages,items}; }
function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
function topTypes(places){ const c={}; for(const p of places) for(const t of (p?.types||[])) c[t]=(c[t]||0)+1; return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([type,count])=>({type,count})); }

function extractCuisinesStrict(places){
  const out=new Set();
  for(const p of places){
    for(const tRaw of (p?.types||[])){
      const t=String(tRaw||"").toLowerCase();
      if(!t.endsWith("_restaurant")) continue;
      const label=titleCase(t.replace(/_restaurant$/,"").replace(/_/g," ").trim());
      if(label) out.add(label);
    }
    const text=`${p?.name||""} ${p?.vicinity||""}`;
    const map=[
      {rx:/\bjapanese\b|\bsushi\b|\bramen\b|\bizakaya\b|\byakitori\b|\btempura\b/i,label:"Japanese"},
      {rx:/\bkorean\b|\bbulgogi\b|\bbibimbap\b|\bkbbq\b/i,label:"Korean"},
      {rx:/\bchinese\b|\bdim sum\b|\bsichuan\b|\bhunan\b|\bcantonese\b|\bhot[ -]?pot\b/i,label:"Chinese"},
      {rx:/\bthai\b|\bpad thai\b|\btom\s?yum\b|\bgreen curry\b/i,label:"Thai"},
      {rx:/\bvietnamese\b|\bpho\b|\bbanh?\s?mi\b|\bbún\b/i,label:"Vietnamese"},
      {rx:/\bindian\b|\bbiryani\b|\bdosa\b|\btandoor|\btikka|\bmasala\b/i,label:"Indian"},
      {rx:/\bmexican\b|\btaqueria\b|\btaco\b|\bal pastor\b|\bbirria\b/i,label:"Mexican"},
      {rx:/\bitalian\b|\bpizza\b|\bpasta\b|\btrattoria\b|\bosteria\b/i,label:"Italian"},
      {rx:/\bfrench\b|\bbistro\b|\bbrasserie\b/i,label:"French"},
      {rx:/\bspanish\b|\btapas\b/i,label:"Spanish"},
      {rx:/\bethiopian\b|\binjera\b/i,label:"Ethiopian"},
      {rx:/\bperuvian\b|\bceviche\b|\bpollo a la brasa\b/i,label:"Peruvian"},
      {rx:/\bgreek\b/i,label:"Greek"},
      {rx:/\bturkish\b/i,label:"Turkish"},
      {rx:/\blebanese\b|\bmezze\b/i,label:"Lebanese"},
      {rx:/\bamerican\b|\bdiner\b/i,label:"American"},
      {rx:/\bburger(s)?\b/i,label:"Burgers"},
      {rx:/\bbbq\b|\bbar-?b-?q\b|\bbarbecue\b/i,label:"BBQ"},
      {rx:/\bsea ?food\b|\boyster\b/i,label:"Seafood"},
      {rx:/\bsandwich(es)?\b|\bdeli\b/i,label:"Sandwiches"},
      {rx:/\bsteakhouse\b|\bsteak\b/i,label:"Steakhouse"},
      {rx:/\bramen\b/i,label:"Ramen"},
      {rx:/\bsushi\b/i,label:"Sushi"},
      {rx:/\bpizza\b/i,label:"Pizza"},
      {rx:/\btapas\b/i,label:"Tapas"}
    ];
    for(const {rx,label} of map) if(rx.test(text)) out.add(label);
  }
  return sortLabels([...out]);
}

async function enrichmentSweep({apiKey,lat,lon,hasCoords,location,usedRadius,already,needAtLeast}){
  const fallback=[
    "Japanese","Korean","Chinese","Thai","Vietnamese","Indian",
    "Mexican","Italian","French","Spanish","Mediterranean",
    "Greek","Turkish","Lebanese","Ethiopian","Peruvian",
    "Caribbean","American","BBQ","Seafood","Burgers","Pizza",
    "Sandwiches","Steakhouse","Sushi","Ramen","Tapas"
  ].filter(x=>!already.has(x));

  const results=[];
  const maxProbes=Math.min(fallback.length, needAtLeast+10);
  for(let i=0;i<maxProbes;i++){
    const kw=fallback[i];
    let items=[];
    if(hasCoords){
      const p=new URLSearchParams({ key:apiKey, location:`${lat},${lon}`, radius:String(usedRadius), type:"restaurant", keyword:String(kw) });
      const u=`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${p}`;
      const j=await safeFetchJson(u);
      items=(j.results||[]).filter(onlyRestaurants);
    }else{
      const u=textUrl(apiKey, `${kw} restaurants in ${location}`);
      const j=await safeFetchJson(u);
      items=(j.results||[]).filter(onlyRestaurants);
    }
    if(items.length>0) results.push(kw);
    if(results.length>=needAtLeast) break;
  }
  return results;
}