import React, { useState } from 'react';
import './MealSuggestions.css';

const mockMeals = [
  { name: "Spaghetti Bolognese", image: "https://source.unsplash.com/featured/?spaghetti" },
  { name: "Sushi Platter", image: "https://source.unsplash.com/featured/?sushi" },
  { name: "Chicken Tikka Masala", image: "https://source.unsplash.com/featured/?indianfood" },
  { name: "Tacos", image: "https://source.unsplash.com/featured/?tacos" },
  { name: "Korean Bibimbap", image: "https://source.unsplash.com/featured/?bibimbap" },
  { name: "Pad Thai", image: "https://source.unsplash.com/featured/?padthai" },
];

export default function MealSuggestions() {
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState([]);

  const handleYes = () => {
    setLiked(prev => [...prev, mockMeals[index]]);
    showNext();
  };

  const handleNo = () => {
    showNext();
  };

  const showNext = () => {
    if (index + 1 < mockMeals.length) {
      setIndex(index + 1);
    } else {
      alert("You've reached the end! You liked: " + liked.map(m => m.name).join(', '));
    }
  };

  return (
    <div className="meal-suggestion">
      <h2>How about this?</h2>
      <img src={mockMeals[index].image} alt={mockMeals[index].name} />
      <h3>{mockMeals[index].name}</h3>
      <div className="buttons">
        <button onClick={handleNo}>Nope</button>
        <button onClick={handleYes}>Sounds Good</button>
      </div>
    </div>
  );
}
