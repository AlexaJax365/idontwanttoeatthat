import React, { useState } from 'react';
import './MealSuggestions.css';

const mockMeals = [
  { name: "Spaghetti Bolognese", cuisine: "Italian", type: "home" },
  { name: "Sushi Platter", cuisine: "Japanese", type: "takeout" },
  { name: "Chicken Tikka Masala", cuisine: "Indian", type: "home" },
  { name: "Tacos", cuisine: "Mexican", type: "takeout" },
  { name: "Bibimbap", cuisine: "Korean", type: "home" },
  { name: "Pad Thai", cuisine: "Thai", type: "home" },
  { name: "Fried Chicken", cuisine: "American", type: "takeout" },
  { name: "Burrito Bowl", cuisine: "Mexican", type: "takeout" },
  { name: "Burger and Fries", cuisine: "American", type: "takeout", image: "https://source.unsplash.com/featured/?burger" },
  { name: "Pho", cuisine: "Vietnamese", type: "takeout", image: "https://source.unsplash.com/featured/?pho" },
  { name: "Steak and Potatoes", cuisine: "American", type: "home", image: "https://source.unsplash.com/featured/?steak" },
  { name: "Ramen", cuisine: "Japanese", type: "takeout", image: "https://source.unsplash.com/featured/?ramen" },

];

export default function MealSuggestions({ rejectedCuisines = [], mealType = "" }) {
  const [liked, setLiked] = useState([]);
  const [rejected, setRejected] = useState([]);

  console.log("Rejected Cuisines:", rejectedCuisines);
  console.log("Meal Type:", mealType);

  const visibleMeals = mockMeals.filter(
    (meal) =>
      !rejectedCuisines.includes(meal.cuisine) &&
      meal.type === mealType
  );

  console.log("Visible Meals:", visibleMeals);

{visibleMeals.length === 0 ? (
  <p>No matching meals found. Try going back and adjusting your preferences.</p>
) : (
  visibleMeals.map((meal, index) => (
    <div className="card" key={index}>
      <img src={meal.image} alt={meal.name} />
      <h3>{meal.name}</h3>
      <div className="buttons">
        <button onClick={() => setRejected(prev => [...prev, meal])}>Nope</button>
        <button onClick={() => setLiked(prev => [...prev, meal])}>Sounds Good</button>
      </div>
    </div>
  ))
)}


  return (
    <div className="meal-suggestion-grid">
      <h2>Here are some ideas:</h2>
      <div className="grid">
        {visibleMeals.map((meal, index) => (
          <div className="card" key={index}>
            <img src={meal.image} alt={meal.name} />
            <h3>{meal.name}</h3>
            <div className="buttons">
              <button onClick={() => setRejected(prev => [...prev, meal])}>Nope</button>
              <button onClick={() => setLiked(prev => [...prev, meal])}>Sounds Good</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
