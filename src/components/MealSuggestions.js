// src/components/MealSuggestions.js
import React, { useEffect, useState } from 'react';
import './MealSuggestions.css';

export default function MealSuggestions({ rejectedCuisines = [], acceptedCuisines = [], mealType = "" }) {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [maxMiles, setMaxMiles] = useState(10);  // default close-by
  const [warning, setWarning] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchMeals(lat, lon) {
      setLoading(true);
      setWarning("");

      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        limit: "24",
        maxMiles: String(maxMiles),
        expand: "0" // do not auto-expand; user can press a button
      });
      if (acceptedCuisines.length) params.set("accepted", acceptedCuisines.join(','));

      const url = `/api/googleSearchRestaurants?${params.toString()}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (cancelled) return;

      let found = Array.isArray(data?.restaurants) ? data.restaurants : [];

      // Client-side guard against rejected cuisines
      if (rejectedCuisines.length) {
        const rejSet = new Set(rejectedCuisines.map(x => x.toLowerCase()));
        found = found.filter(p => {
          const types = (p.types || []).map(t => String(t).toLowerCase());
          const labelsFromTypes = types
            .filter(t => t.endsWith('_restaurant'))
            .map(t => t.replace(/_restaurant$/, '').replace(/_/g, ' '));
          const name = `${p.name || ""} ${p.vicinity || ""}`.toLowerCase();
          const hitsRejected = labelsFromTypes.some(l => rejSet.has(l)) || [...rejSet].some(rj => name.includes(rj));
          return !hitsRejected;
        });
      }

      setMeals(found);
      if (data?.warning) setWarning(data.warning);
      setLoading(false);
    }

    if (mealType === "home") {
      setMeals([]);
      setLoading(false);
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => fetchMeals(coords.latitude, coords.longitude),
        () => fetchMeals(40.7128, -74.0060)
      );
    } else {
      fetchMeals(40.7128, -74.0060);
    }

    return () => { cancelled = true; };
  }, [acceptedCuisines, rejectedCuisines, mealType, maxMiles]);

  const handleNope = (idx) => {
    setMeals(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSoundsGood = (mapsUrl) => {
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };

  const imgFor = (meal) => {
    if (meal.photo_reference) {
      return `/api/googlephoto?ref=${encodeURIComponent(meal.photo_reference)}&maxwidth=640`;
    }
    return "https://source.unsplash.com/featured/?restaurant";
  };

  const canExpand = maxMiles < 50;

  return (
    <div className="meal-suggestion-grid">
      <h2>
        Here are some {mealType === "takeout" ? "eat out" : "restaurant-style"} ideas near you:
      </h2>

      {warning && <p style={{ color: '#a15' }}>{warning}</p>}

      <div style={{ marginBottom: 12 }}>
        <strong>Search radius:</strong> ~{maxMiles} miles{' '}
        {canExpand && (
          <button
            style={{ marginLeft: 8 }}
            onClick={() => setMaxMiles(m => Math.min(50, m + 5))}
          >
            Search farther (+5 mi)
          </button>
        )}
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : meals.length === 0 ? (
        <p>No matching places found within ~{maxMiles} miles. {canExpand ? 'Try “Search farther”.' : ''}</p>
      ) : (
        <div className="grid">
          {meals.map((meal, index) => (
            <div className="card" key={meal.place_id || index}>
              <img src={imgFor(meal)} alt={meal.name} />
              <h3>{meal.name}</h3>
              <p>{meal.vicinity || "Location not available"}</p>
              <div className="buttons">
                <button onClick={() => handleNope(index)}>Nope</button>
                <button onClick={() => handleSoundsGood(meal.maps_url)}>Sounds Good</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}