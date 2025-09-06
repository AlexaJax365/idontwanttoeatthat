// src/components/CuisineSelector.js
import React, { useEffect, useMemo, useState } from 'react';
import './CuisineSelector.css';

function CuisineSelector({ onNext }) {
  const [cuisines, setCuisines] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [batchIndex, setBatchIndex] = useState(0);

  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  // 🔁 Controls for progressively asking the API for MORE labels
  const [minLabels, setMinLabels] = useState(16); // start with 16
  const [fetchAttempt, setFetchAttempt] = useState(0); // bump this to refetch
  const [jitterSeed, setJitterSeed] = useState(0); // a small nudge to lat/lon

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

  // Small jitter so subsequent fetches can shake loose slightly different places
  const jitteredLocation = useMemo(() => {
    if (!location) return null;
    if (!jitterSeed) return location;

    // ~0.02 deg ~= ~2.2 km; keep it tiny to stay local
    const delta = 0.02 * (jitterSeed % 5); // grows a bit on each try, loops every 5
    return {
      lat: location.lat + delta,
      lon: location.lon - delta / 2
    };
  }, [location, jitterSeed]);

  // Helper: fetch cuisines from your serverless API
  async function fetchCuisinesDeep({ lat, lon, wantedMinLabels }) {
    const url = `/api/googleCuisinesByLocation?latitude=${lat}&longitude=${lon}`
      + `&mode=deep&minLabels=${wantedMinLabels}&maxPages=3`;
    if (DEBUG) console.log("🌐 fetch:", url);

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const list = Array.isArray(data) ? data : Array.isArray(data?.cuisines) ? data.cuisines : [];
    const uniqueSorted = Array.from(new Set(list.map(x => String(x).trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    if (DEBUG) {
      console.log("✅ cuisines len:", uniqueSorted.length, uniqueSorted);
      if (data?.usedRadius) console.log("usedRadius:", data.usedRadius);
      if (data?.attempts) console.log("attempts:", data.attempts);
    }

    return uniqueSorted;
  }

  // 2) Load cuisines with retries driven by (minLabels, jitterSeed, fetchAttempt)
  useEffect(() => {
    if (!jitteredLocation) return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErrMsg("");
        setRejected([]);
        setBatchIndex(0);

        const got = await fetchCuisinesDeep({
          lat: jitteredLocation.lat,
          lon: jitteredLocation.lon,
          wantedMinLabels: minLabels
        });

        if (cancelled) return;
        setCuisines(got);
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
  }, [jitteredLocation, minLabels, fetchAttempt]); // re-run when we ask for more, or nudge location

  // Current batch slice
  const currentBatch = useMemo(
    () => cuisines.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize),
    [cuisines, batchIndex]
  );
  const shownSoFar = useMemo(
    () => cuisines.slice(0, (batchIndex + 1) * batchSize),
    [cuisines, batchIndex]
  );

  // Toggle rejection for a label
  const toggleReject = (cuisine) => {
    setRejected(prev =>
      prev.includes(cuisine)
        ? prev.filter(item => item !== cuisine)
        : [...prev, cuisine]
    );
  };

  // “I don’t like any of these”
  //  - If there’s another local batch, advance to it
  //  - Otherwise, escalate: ask the API for more labels (minLabels += 8) and add a slight location jitter
  const handleRejectAllCurrent = () => {
    if (currentBatch.length) {
      setRejected(prev => [
        ...prev,
        ...currentBatch.filter(title => !prev.includes(title))
      ]);
    }
    const nextIndex = batchIndex + 1;
    if (nextIndex * batchSize < cuisines.length) {
      setBatchIndex(nextIndex);
      return;
    }
    // No more local batches → escalate
    setMinLabels(m => Math.min(64, m + 8)); // cap to avoid huge UI lists
    setJitterSeed(s => s + 1);
    setFetchAttempt(t => t + 1);
  };

  // Manual retry for error/empty
  const retryNow = () => {
    setErrMsg("");
    setCuisines([]);
    setRejected([]);
    setBatchIndex(0);
    setFetchAttempt(t => t + 1);
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

      {!loading && !errMsg && cuisines.length === 0 && (
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
            disabled={loading}
          >
            {cuisine}
          </button>
        ))}
      </div>

      {!!cuisines.length && (
        <div style={{ marginTop: '1em', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={handleRejectAllCurrent} type="button" disabled={loading}>
            I don’t like any of these ⟳
          </button>
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
            disabled={loading}
          >
            Next ➡
          </button>
        </div>
      )}
    </div>
  );
}

export default CuisineSelector;



