// src/components/MealSuggestions.js
import React, { useEffect, useState } from 'react';
import './MealSuggestions.css';

export default function MealSuggestions({ rejectedCuisines = [], acceptedCuisines = [], mealType = "" }) {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function run() {
      setLoading(true);
      try {
        const coords = await getCoords();
        const accepted = (acceptedCuisines || []).filter(Boolean);
        let all = [];

        if (accepted.length === 0) {
          // Fallback: generic nearby restaurants (use keyword "restaurant")
          const base = await fetch(buildCuisineUrl(coords, "restaurant")).then(r => r.json());
          const items = base?.restaurants || base || [];
          all = items;
        } else {
          // Fetch per accepted cuisine; merge & de-dup by place_id
          const results = await Promise.all(
            accepted.map(c =>
              fetch(buildCuisineUrl(coords, c)).then(r => r.json()).catch(() => ({ restaurants: [] }))
            )
          );
          const merged = {};
          results.forEach(({ restaurants = [] }) => {
            restaurants.forEach(x => { merged[x.id] = x; });
          });
          all = Object.values(merged);
        }

        // Filter out items that match rejected terms (safety)
        const rejectSet = new Set((rejectedCuisines || []).map(x => x.toLowerCase()));
        const final = all.filter(item => {
          const name = `${item.name} ${item.address}`.toLowerCase();
          if ([...rejectSet].some(rej => rej && name.includes(rej))) return false;
          return true;
        });

        setMeals(final);
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [rejectedCuisines, acceptedCuisines, mealType]);

  const handleNope = (id) => setMeals(prev => prev.filter(x => x.id !== id));
  const handleSoundsGood = (url) => window.open(url, '_blank', 'noopener');

  return (
    <div className="meal-suggestion-grid">
      <h2>Here are some {mealType === "takeout" ? "eat out" : "restaurant-style"} ideas near you:</h2>

      {loading ? <p>Loading...</p>
        : meals.length === 0 ? <p>No matching meals found. Try going back and adjusting your preferences.</p>
        : (
          <div className="grid">
            {meals.map((m) => (
              <div className="card" key={m.id}>
                <img
                  src={photoUrl(m.photoRef) || "https://source.unsplash.com/featured/?restaurant"}
                  alt={m.name}
                />
                <h3>{m.name}</h3>
                <p>{m.address}</p>
                <div className="buttons">
                  <button onClick={() => handleNope(m.id)}>Nope</button>
                  <button onClick={() => handleSoundsGood(m.url)}>Sounds Good</button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function buildCuisineUrl(coords, cuisine) {
  const q = new URLSearchParams({
    cuisine: cuisine || "restaurant",
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    radius: "4000"
  });
  return `/api/googleSearchRestaurants?${q.toString()}`;
}

function photoUrl(ref) {
  if (!ref) return "";
  const p = new URLSearchParams({ ref, maxwidth: "400" });
  return `/api/googlePlacePhoto?${p.toString()}`;
}

function getCoords() {
  return new Promise((resolve) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude }),
        () => resolve({ lat: 40.7128, lon: -74.0060 }),
        { timeout: 8000 }
      );
    } else {
      resolve({ lat: 40.7128, lon: -74.0060 });
    }
  });
}
