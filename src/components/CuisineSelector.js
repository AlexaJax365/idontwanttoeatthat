// src/components/CuisineSelector.js
import React, { useEffect, useState } from 'react';
import './CuisineSelector.css';

export default function CuisineSelector({ onNext }) {
  const [cuisines, setCuisines] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [batchIndex, setBatchIndex] = useState(0);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const batchSize = 10;
  const defaultLoc = { lat: 40.7128, lon: -74.0060 }; // NYC fallback
  const radius = 1500; // meters (server may expand internally)

  // Toggle to see debug logs in the browser console
  const DEBUG = false;

  useEffect(() => {
    setLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          setLocation({ lat: coords.latitude, lon: coords.longitude });
        },
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

  useEffect(() => {
    async function loadCuisines() {
      if (!location) return;
      try {
        setLoading(true);
        setErrMsg("");

        const url = `/api/googleCuisinesByLocation?latitude=${location.lat}&longitude=${location.lon}&radius=${radius}`;
        if (DEBUG) console.log("⚡ fetching cuisines:", url);

	const res = await fetch(`/api/googleCuisinesByLocation?latitude=${location.lat}&longitude ${location.lon}&radius=1500`);
	const data = await res.json();
	setCuisines(Array.isArray(data?.cuisines) ? data.cuisines : []);


        // Ensure an array of unique, non-empty strings; sort for stable order
        const unique = Array.from(
          new Set(
            (Array.isArray(data) ? data : []).map(x => String(x).trim()).filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        if (DEBUG) console.log("🍱 cuisines received:", unique);

        setCuisines(unique);
        setBatchIndex(0);
        setRejected([]); // reset selections when location changes
      } catch (err) {
        console.error("Failed to load dynamic categories", err);
        setErrMsg("Couldn’t load cuisines near you. Please try again.");
        setCuisines([]);
      } finally {
        setLoading(false);
      }
    }
    loadCuisines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

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

  return (
    <div>
      <h2>Tap the cuisines you DON’T want:</h2>

      {loading && <p>Loading cuisines near you…</p>}
      {!loading && errMsg && <p style={{ color: 'crimson' }}>{errMsg}</p>}

      {!loading && !errMsg && currentBatch.length === 0 && cuisines.length === 0 && (
        <p>No cuisines found nearby. You can still continue to the next step.</p>
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
            // accepted = everything shown so far minus rejected
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
