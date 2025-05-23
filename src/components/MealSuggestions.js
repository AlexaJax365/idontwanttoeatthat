import React, { useState } from 'react';
import './MealSuggestions.css';

const mockMeals = [
  { name: "Spaghetti Bolognese", image: "https://source.unsplash.com/featured/?spaghetti", cuisine: "Italian" },
  { name: "Sushi Platter", image: "https://source.unsplash.com/featured/?sushi", cuisine: "Japanese" },
  { name: "Chicken Tikka Masala", image: "https://source.unsplash.com/featured/?indianfood", cuisine: "Indian" },
  { name: "Tacos", image: "https://source.unsplash.com/featured/?tacos", cuisine: "Mexican" },
  { name: "Bibimbap", image: "https://source.unsplash.com/featured/?bibimbap", cuisine: "Korean" },
  { name: "Pad Thai", image: "https://source.unsplash.com/featured/?padthai", cuisine: "Thai" },
  { name: "Fried Chicken", image: "https://source.unsplash.com/featured/?friedchicken", cuisine: "American" },
  { name: "Burrito Bowl", image: "https://source.unsplash.com/featured/?burrito", cuisine: "Mexican" },
];

export default function MealSuggestions({ rejectedCuisines = [] }) {
  const [liked, setLiked] = useState([]);
  const [rejected, setRejected] = useState([]);

  const visibleMeals = mockMeals.filter(
    meal => !rejectedCuisines.includes(meal.cuisine)
  );

  const handleSelect = (meal, likedMeal) => {
    if (likedMeal) {
      setLiked(prev => [...prev, meal]);
    } else {
      setRejected(prev => [...prev, meal]);
    }
  };

  return (
    <div className="meal-suggestion-grid">
      <h2>Here are some ideas:</h2>
      <div className="grid">
        {visibleMeals.map((meal, index) => (
  	  <div className="card" key={index}>
            <img src={meal.image} alt={meal.name} />
            <h3>{meal.name}</h3>
            <div className="buttons">
              <button onClick={() => handleSelect(meal, false)}>Nope</button>
              <button onClick={() => handleSelect(meal, true)}>Sounds Good</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
