import React, { useState } from 'react';
import './MealSuggestions.css';

const mockMeals = [
  { name: "Spaghetti Bolognese", image: "https://source.unsplash.com/featured/?spaghetti" },
  { name: "Sushi Platter", image: "https://source.unsplash.com/featured/?sushi" },
  { name: "Chicken Tikka Masala", image: "https://source.unsplash.com/featured/?indianfood" },
  { name: "Tacos", image: "https://source.unsplash.com/featured/?tacos" },
  { name: "Bibimbap", image: "https://source.unsplash.com/featured/?bibimbap" },
  { name: "Pad Thai", image: "https://source.unsplash.com/featured/?padthai" },
  { name: "Fried Chicken", image: "https://source.unsplash.com/featured/?friedchicken" },
  { name: "Burrito Bowl", image: "https://source.unsplash.com/featured/?burrito" },
];

export default function MealSuggestions() {
  const [liked, setLiked] = useState([]);
  const [rejected, setRejected] = useState([]);

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
        {mockMeals.map((meal, index) => (
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
