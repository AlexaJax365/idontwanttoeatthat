import React, { useState, useEffect } from 'react';
import './MealSuggestions.css';

export default function MealSuggestions({ rejectedCuisines = [], acceptedCuisines = [], mealType = "" }) {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [radius, setRadius] = useState(1000); // meters

  useEffect(() => {
    function fetchMeals(lat, lon, r = radius) {
      const acceptedParam = acceptedCuisines.length ? `&accepted=${acceptedCuisines.join(',')}` : "";
      const query = `/api/googlePlacesSearch?latitude=${lat}&longitude=${lon}&limit=40&radius=${r}${acceptedParam}`;

      fetch(query)
        .then(res => res.json())
        .then(({ businesses = [], warning }) => {
          // Filter: accepted wins; we don’t exclude if a business also has unrelated categories
          const filtered = businesses.filter(() => true);

          if (filtered.length === 0 && r < 120000) {
            // Expand radius automatically
            setRadius(r + 8000);
          } else {
            if (warning) {
              // Optional: surface in UI instead of alert
              console.warn(warning);
            }
            setMeals(filtered);
            setLoading(false);
          }
        })
        .catch(err => {
          console.error("Google places fetch error:", err);
          setLoading(false);
        });
    }

    if (navigator.geolocation) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        pos => fetchMeals(pos.coords.latitude, pos.coords.longitude),
        () => fetchMeals(40.7128, -74.0060) // NYC fallback
      );
    } else {
      fetchMeals(40.7128, -74.0060);
    }
  }, [acceptedCuisines, mealType, radius]);

  const handleNope = (idx) => setMeals(prev => prev.filter((_, i) => i !== idx));
  const handleSoundsGood = (url) => window.open(url, '_blank');

  return (
    <div className="meal-suggestion-grid">
      <h2>Here are some {mealType === "takeout" ? "eat out" : "restaurant-style"} ideas near you:</h2>

      {loading ? (
        <p>Loading...</p>
      ) : meals.length === 0 ? (
        <p>No matching meals found. Try going back and adjusting your preferences.</p>
      ) : (
        <div className="grid">
          {meals.map((meal, index) => (
            <div className="card" key={index}>
              {meal.image_url ? (
                <img src={meal.image_url} alt={meal.name} />
              ) : (
                <img src="https://source.unsplash.com/featured/?restaurant" alt={meal.name} />
              )}
              <h3>{meal.name}</h3>
              <p>{meal.location?.address1 || "Location not available"}</p>
              <div className="buttons">
                <button onClick={() => handleNope(index)}>Nope</button>
                <button onClick={() => handleSoundsGood(meal.url)}>Sounds Good</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
