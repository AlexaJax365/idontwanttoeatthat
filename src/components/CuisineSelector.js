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

  // Small helper to call the API with radius + pages
  async function fetchCuisines({ lat, lon, radius, maxPages }) {
    const url = `/api/googleCuisinesByLocation?latitude=${lat}&longitude=${lon}&radius=${radius}&maxPages=${maxPages}`;
    if (DEBUG) console.log("⚡ fetch:", url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Endpoint returns a plain array (per our latest server code)
    const list = Array.isArray(data) ? data : Array.isArray(data?.cuisines) ? data.cuisines : [];
    // Dedupe + clean + sort
    const unique = Array.from(new Set(list.map(x => String(x).trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    return unique;
  }

  // 2) Load cuisines dynamically with retries (radius/pages expansion)
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
          { radius: 1500,  maxPages: 2 },  // ~1.5 km
          { radius: 4000,  maxPages: 3 },  // 4 km
          { radius: 8000,  maxPages: 3 },  // 8 km
          { radius: 16000, maxPages: 3 },  // 16 km
          { radius: 32000, maxPages: 3 },  // 32 km
          { radius: 50000, maxPages: 3 },  // 50 km
        ];

        let all = [];
        for (const a of attempts) {
          const got = await fetchCuisines({ lat: location.lat, lon: location.lon, radius: a.radius, maxPages: a.maxPages });
          if (DEBUG) console.log(`📍 radius ${a.radius} → ${got.length} cuisines`);
          all = got;
          if (all.length >= 8) break; // “good enough” threshold
        }

        if (cancelled) return;

        setCuisines(all);
        if (DEBUG) console.log("🍣 final cuisines:", all);
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
  const shownSoFar = cuisines.slice(0, (batchIndex + 1) * batchSize);

  const toggleReject = (cuisine) => {
    setRejected(prev =>
      prev.includes(cuisine)
        ? prev.filter(item => item !== cuisine)
        : [...prev, cuisine]
    );
  };

  // “I don’t like any of these” = reject the current batch, then advance
  const nextBatch = () => {
    if (currentBatch.length) {
      setRejected(prev => [
        ...prev,
        ...currentBatch.filter(title => !prev.includes(title))
      ]);
    }
    const nextIndex = batchIndex + 1;
    if (nextIndex * batchSize >= cuisines.length) {
      alert("No more cuisines left to show.");
    } else {
      setBatchIndex(nextIndex);
    }
  };

  const retryNow = () => {
    // Bump a tiny delta in location to force refetch, or just reset state
    setCuisines([]);
    setRejected([]);
    setBatchIndex(0);
    // re-run effect by tweaking location object
    setLocation(loc => ({ ...(loc || defaultLoc) }));
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
          <p>No cuisines found nearby right now. You can try again or continue.</p>
          <button type="button" onClick={retryNow}>Try again</button>
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

      <div style={{ marginTop: '1em', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button onClick={nextBatch} type="button">I don’t like any of these ⟳</button>
        <button
          onClick={() => {
            const accepted = shownSoFar.filter(title => !rejected.includes(title));
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
