import React, { useState } from 'react';
import './MealSuggestions.css';

const mockMeals = [
  { name: "Spaghetti Bolognese", image: "https://source.unsplash.com/featured/?spaghetti", cuisine: "Italian", type: "home" },
  { name: "Sushi Platter", image: "https://source.unsplash.com/featured/?sushi", cuisine: "Japanese", type: "takeout" },
  { name: "Chicken Tikka Masala", image: "https://source.unsplash.com/featured/?indianfood", cuisine: "Indian", type: "home" },
  { name: "Tacos", image: "https://source.unsplash.com/featured/?tacos", cuisine: "Mexican", type: "takeout" },
  { name: "Bibimbap", image: "https://source.unsplash.com/featured/?bibimbap", cuisine: "Korean", type: "home" },
  { name: "Pad Thai", image: "https://source.unsplash.com/featured/?padthai", cuisine: "Thai", type: "home" },
  { name: "Fried Chicken", image: "https://source.unsplash.com/featured/?friedchicken", cuisine: "American", type: "takeout" },
  { name: "Burrito Bowl", image: "https://source.unsplash.com/featured/?burrito", cuisine: "Mexican", type: "takeout" },
];

export default function MealSuggestions({ rejectedCuisines = [] }) {
  const [liked, setLiked] = useState([]);
  const [rejected, setRejected] = useState([]);

 const visibleMeals = mockMeals.filter(
  meal =>
    !rejectedCuisines.includes(meal.cuisine) &&
    meal.type === mealType
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
