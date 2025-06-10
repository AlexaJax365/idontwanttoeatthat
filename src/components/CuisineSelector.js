import React, { useState } from 'react';
import './CuisineSelector.css';

const cuisineOptions = [
  "Italian", "Chinese", "Mexican", "Japanese",
  "Korean", "Indian", "American", "Thai", "Greek", 
  "French", "MiddleEastern", "Vietnamese", "Mediterranean", "Filipino"
];

export default function CuisineSelector({ onNext }) {
  const [rejected, setRejected] = useState([]);

  const toggleCuisine = (cuisine) => {
    setRejected(prev =>
      prev.includes(cuisine)
        ? prev.filter(c => c !== cuisine)
        : [...prev, cuisine]
    );
  };

  const handleNext = () => {
    console.log("Rejected Cuisines:", rejected);
    alert("Rejected: " + rejected.join(', '));
    onNext(rejected); // move to the next step
  };

  return (
    <div>
      <h2>What don’t you want to eat?</h2>
      <div className="cuisine-grid">
        {cuisineOptions.map(cuisine => (
          <button
            key={cuisine}
            className={rejected.includes(cuisine) ? 'selected' : ''}
            onClick={() => toggleCuisine(cuisine)}
          >
            {cuisine}
          </button>
        ))}
      </div>
      <button onClick={handleNext}>Next</button>
    </div>
  );
}
