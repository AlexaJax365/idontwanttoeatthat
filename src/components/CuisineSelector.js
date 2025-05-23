
import React, { useState } from 'react';
import axios from 'axios';

const cuisineOptions = ["Italian", "Mexican", "Chinese", "Japanese", "Korean", "Indian", "Thai", "American"];

export default function CuisineSelector({ userId }) {
  const [selectedCuisines, setSelectedCuisines] = useState([]);

  const toggleCuisine = (cuisine) => {
    setSelectedCuisines(prev =>
      prev.includes(cuisine)
        ? prev.filter(item => item !== cuisine)
        : [...prev, cuisine]
    );
  };

  const submitRejections = async () => {
    try {
      await axios.post("http://localhost:5000/api/cuisines/reject", {
        userId,
        rejectedCuisines: selectedCuisines,
      });
      alert("Preferences saved!");
    } catch (error) {
      console.error("Error sending rejections:", error);
      alert("Failed to save preferences.");
    }
  };

  return (
    <div>
      <h2>What cuisines do you NOT want?</h2>
      <div className="cuisine-buttons">
        {cuisineOptions.map(cuisine => (
          <button
            key={cuisine}
            className={selectedCuisines.includes(cuisine) ? "selected" : ""}
            onClick={() => toggleCuisine(cuisine)}
          >
            {cuisine}
          </button>
        ))}
      </div>
      <button onClick={submitRejections}>Next</button>
    </div>
  );
}
