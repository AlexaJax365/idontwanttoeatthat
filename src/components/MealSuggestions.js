import React, { useState, useEffect } from 'react';
import './MealSuggestions.css';

export default function MealSuggestions({ rejectedCuisines = [], acceptedCuisines = [], mealType = "" }) {
  const [meals, setMeals] = useState([]);
  const [liked, setLiked] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function fetchMealsWithLocation(lat, lon) {
      const query = `/api/yelpAPI?term=food&latitude=${lat}&longitude=${lon}&limit=20&accepted=${acceptedCuisines.join(',')}`;
      
      fetch(query)
        .then(res => res.json())
        .then(data => {
          const filtered = data.filter(business => {
            const categories = business.categories.map(cat => cat.title.toLowerCase());

            const isRejected = rejectedCuisines.some(rej =>
              categories.includes(rej.toLowerCase())
            );

            const isAccepted = acceptedCuisines.some(acc =>
              categories.includes(acc.toLowerCase())
            );

            // mealType logic – Yelp API is only for restaurant data, so skip home
            if (mealType === "home") return false;

            console.log("Accepted Cuisines:", acceptedCuisines);

            return isAccepted && !isRejected;
          });

          // Debug logs
          console.log("Rejected Cuisines:", rejectedCuisines);
          console.log("Meal Type:", mealType);
          console.log("Yelp Meals:", filtered);

          setMeals(filtered);
          setLoading(false);
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
          const { latitude, longitude } = position.coords;
          fetchMealsWithLocation(latitude, longitude);
        },
        () => {
          console.warn("Location access denied. Using default location.");
          fetchMealsWithLocation(40.7128, -74.0060); // NYC fallback
        }
      );
    } else {
      console.warn("Geolocation not supported.");
      fetchMealsWithLocation(40.7128, -74.0060);
    }
  }, [rejectedCuisines, acceptedCuisines, mealType]);

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
                <button onClick={() => setRejected(prev => [...prev, meal])}>Nope</button>
                <button onClick={() => setLiked(prev => [...prev, meal])}>Sounds Good</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
