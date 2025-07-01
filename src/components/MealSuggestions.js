import React, { useState, useEffect } from 'react';
import './MealSuggestions.css';

export default function MealSuggestions({ rejectedCuisines = [], acceptedCuisines = [], mealType = "" }) {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [radius, setRadius] = useState(16000); // initial ~10 miles

  useEffect(() => {
    function fetchMeals(lat, lon, searchRadius = radius) {
      const query = `/api/yelpAPI?term=food&latitude=${lat}&longitude=${lon}&limit=40&radius=${searchRadius}&accepted=${acceptedCuisines.join(',')}`;
      
      fetch(query)
        .then(res => res.json())
        .then(data => {
          let businesses = data.businesses || data; // depends on your API response format
          const filtered = businesses.filter(business => {
            const categories = business.categories.map(cat => cat.title.toLowerCase());
            const isRejected = rejectedCuisines.some(rej =>
              categories.includes(rej.toLowerCase())
            );
            const isAccepted = acceptedCuisines.some(acc =>
              categories.includes(acc.toLowerCase())
            );
            return isAccepted && !isRejected;
          });

          if (filtered.length === 0 && searchRadius < 80000) {
            console.log(`🔁 Expanding search radius to ${searchRadius + 8000} meters...`);
            setRadius(searchRadius + 8000);
          } else {
            setMeals(filtered);
            setLoading(false);
          }
        })
        .catch(err => {
          console.error("Error fetching Yelp meals:", err);
          setLoading(false);
        });
    }

    if (navigator.geolocation) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          fetchMeals(position.coords.latitude, position.coords.longitude);
        },
        () => {
          console.warn("Location denied. Using NYC as fallback.");
          fetchMeals(40.7128, -74.0060);
        }
      );
    } else {
      console.warn("Geolocation not supported. Using NYC as fallback.");
      fetchMeals(40.7128, -74.0060);
    }
  }, [rejectedCuisines, acceptedCuisines, mealType, radius]);

  const handleNope = (idx) => {
    setMeals(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSoundsGood = (url) => {
    window.open(url, '_blank');
  };

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
              <img src={meal.image_url || "https://source.unsplash.com/featured/?food"} alt={meal.name} />
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