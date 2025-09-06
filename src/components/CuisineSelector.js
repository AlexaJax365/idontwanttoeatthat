// src/components/CuisineSelector.js
import React, { useEffect, useState } from 'react';
import './CuisineSelector.css';

function CuisineSelector({ onNext }) {
  const [cuisines, setCuisines] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [batchIndex, setBatchIndex] = useState(0);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const batchSize = 10;
  const defaultLoc = { lat: 40.7128, lon: -74.0060 }; // NYC fallback
  const DEBUG = false;
  const CLIENT_TIMEOUT_MS = 2500; // abort slow fetches quickly

  // 1) Get user location (fallback to NYC)
  useEffect(() => {
    setLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => setLocation({ lat: coords.latitude, lon: coords.longitude }),
        () => {
          console.warn("Geolocation denied. Using NYC fallback.");
          setLocation(defaultLoc);
        },
        { timeout: 8000 }
      );
    } else {
      console.warn("Geolocation not supported. Using NYC fallback.");
      setLocation(defaultLoc);
    }
  }, []);

  // Helper: call the API in FAST mode with a client timeout
  async function fetchCuisinesFast({ lat, lon, radius }) {
    const url = `/api/googleCuisinesByLocation?latitude=${lat}&longitude=${lon}&radius=${radius}&minLabels=12&mode=fast`;
    if (DEBUG) console.log("⚡ fetch:", url);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Accept either plain array or { cuisines: [...] }
      const list = Array.isArray(data)
        ? data
        : (data && typeof data === 'object' && Array.isArray(data.cuisines))
          ? data.cuisines
          : [];

      // Dedupe + clean + sort
      const unique = Array.from(new Set(list.map(x => String(x).trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

      return unique;
    } catch (e) {
      if (DEBUG) console.warn("Fetch failed/aborted:", e?.message);
      return [];
    } finally {
      clearTimeout(t);
    }
  }

  // Deep fetch: paginate & wider radii via server
  async function fetchCuisinesDeep({ lat, lon }) {
    const url = `/api/googleCuisinesByLocation?latitude=${lat}&longitude=${lon}&minLabels=16&mode=deep&maxPages=3`;
    const res = await fetch(url);
    const data = await res.json();
    const list = Array.isArray(data)
      ? data
      : (data && typeof data === 'object' && Array.isArray(data.cuisines))
        ? data.cuisines
        : [];
    return Array.from(new Set(list.map(s => String(s).trim()).filter(Boolean)))
      .sort((a,b)=>a.localeCompare(b, undefined, {sensitivity:'base'}));
  }

  // 2) Load cuisines dynamically with quick radius expansion (fast, no pagination)
  useEffect(() => {
    if (!location) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErrMsg("");
        setRejected([]);
        setBatchIndex(0);

        const attempts = [
          { radius: 8000 },   // ~5 mi
          { radius: 16000 },  // ~10 mi
          { radius: 32000 },  // ~20 mi
          { radius: 50000 },  // ~31 mi
        ];

        let found = [];
        for (const a of attempts) {
          const got = await fetchCuisinesFast({ lat: location.lat, lon: location.lon, radius: a.radius });
          if (DEBUG) console.log(`📍 radius ${a.radius} → ${got.length} cuisines`);
          found = got;
          if (found.length >= 8) break; // “good enough” threshold
        }

        if (cancelled) return;

        setCuisines(found);
        if (DEBUG) console.log("🍣 final cuisines:", found);
      } catch (err) {
        console.error("Failed to load dynamic categories", err);
        if (!cancelled) {
          setErrMsg("Couldn’t load cuisines near you. Please try again.");
          setCuisines([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [location]); // keep deps minimal to avoid loops

  const currentBatch = cuisines.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);

  const toggleReject = (cuisine) => {
    setRejected(prev =>
      prev.includes(cuisine)
        ? prev.filter(item => item !== cuisine)
        : [...prev, cuisine]
    );
  };

  // “I don’t like any of these” = reject the current batch, then advance (and deep-fetch if needed)
  const nextBatch = async () => {
    if (currentBatch.length) {
      setRejected(prev => [
        ...prev,
        ...currentBatch.filter(title => !prev.includes(title))
      ]);
    }
    const nextIndex = batchIndex + 1;
    if (nextIndex * batchSize >= cuisines.length) {
      // We ran out. Try a deep fetch to load more cuisines dynamically.
      try {
        setLoading(true);
        const more = await fetchCuisinesDeep({ lat: location.lat, lon: location.lon });
        if (more.length > cuisines.length) {
          setCuisines(more);
          setBatchIndex(nextIndex);
        } else {
          alert("No more cuisines left to show.");
        }
      } catch {
        alert("Couldn't find more cuisines right now.");
      } finally {
        setLoading(false);
      }
    } else {
      setBatchIndex(nextIndex);
    }
  };

  const retryNow = () => {
    setCuisines([]);
    setRejected([]);
    setBatchIndex(0);
    setErrMsg("");
    setLoading(true);
    setLocation(loc => ({ ...(loc || defaultLoc) })); // triggers effect
  };

  return (
    <div>
      <h2>Tap the cuisines you DON’T want:</h2>

      {loading && <p>Loading cuisines near you…</p>}
      {!loading && errMsg && (
        <div>
          <p style={{ color: 'crimson' }}>{errMsg}</p>
          <button type="button" onClick={retryNow}>Try again</button>
        </div>
      )}

      {!loading && !errMsg && currentBatch.length === 0 && cuisines.length === 0 && (
        <div>
          <p>No cuisines found nearby right now.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={retryNow}>Try again</button>
            <button
              type="button"
              onClick={() => onNext([], [])}
              title="Continue without picking cuisines"
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      <div className="cuisine-grid">
        {currentBatch.map((cuisine, idx) => (
          <button
            key={idx}
            className={rejected.includes(cuisine) ? "rejected" : ""}
            onClick={() => toggleReject(cuisine)}
            type="button"
          >
            {cuisine}
          </button>
        ))}
      </div>

      <p style={{ marginTop: 4 }}>
        Selected: {rejected.length} • Showing {currentBatch.length} of {cuisines.length}
      </p>

      <div style={{ marginTop: '1em', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button onClick={nextBatch} type="button">I don’t like any of these ⟳</button>
        <button
          onClick={() => {
            // Accept only from the CURRENT batch (stricter, clearer)
            const accepted = currentBatch.filter(title => !rejected.includes(title));
            if (DEBUG) {
              console.log("🚦 rejected:", rejected);
              console.log("🚦 accepted:", accepted);
            }
            onNext(rejected, accepted);
          }}
          type="button"
        >
          Next ➡
        </button>
      </div>
    </div>
  );
}

export default CuisineSelector;


