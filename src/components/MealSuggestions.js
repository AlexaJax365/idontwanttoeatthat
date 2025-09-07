// src/components/MealSuggestions.js
import React, { useEffect, useState } from 'react';
import './MealSuggestions.css';

export default function MealSuggestions({ rejectedCuisines = [], acceptedCuisines = [], mealType = "" }) {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [radius, setRadius] = useState(8000); // start ~5 miles
  const [warning, setWarning] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchMeals(lat, lon, searchRadius = radius) {
      setLoading(true);
      setWarning("");

      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        limit: "24",
        radius: String(searchRadius)
      });

      if (acceptedCuisines.length) {
        params.set("accepted", acceptedCuisines.join(','));
      }

      const url = `/api/googleSearchRestaurants?${params.toString()}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();

      if (cancelled) return;

      const found = Array.isArray(data?.restaurants) ? data.restaurants : [];
      setMeals(found);
      if (data?.warning) setWarning(data.warning);
      setLoading(false);

      // If nothing found, auto-expand radius up to 120km
      if (!found.length && searchRadius < 120000) {
        setRadius(searchRadius + 8000);
      }
    }

    if (mealType === "home") {
      // You can plug Spoonacular here for recipes based on acceptedCuisines.
      setMeals([]);
      setLoading(false);
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => fetchMeals(coords.latitude, coords.longitude),
        () => fetchMeals(40.7128, -74.0060) // NYC fallback
      );
    } else {
      fetchMeals(40.7128, -74.0060);
    }

    return () => { cancelled = true; };
  }, [acceptedCuisines, mealType, radius]);

  const handleNope = (idx) => {
    setMeals(prev => {
      const next = prev.filter((_, i) => i !== idx);
      // If we’ve eliminated everything, nudge radius to fetch more on next render
      if (next.length === 0 && radius < 120000) setRadius(r => r + 8000);
      return next;
    });
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

  return (
    <div className="meal-suggestion-grid">
      <h2>
        Here are some {mealType === "takeout" ? "eat out" : "restaurant-style"} ideas near you:
      </h2>

      {warning && (
        <p style={{ color: '#a15' }}>{warning}</p>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : meals.length === 0 ? (
        <p>No matching places found. Try going back or adjusting preferences.</p>
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
