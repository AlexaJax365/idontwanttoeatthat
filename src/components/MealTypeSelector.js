import React, { useState } from 'react';
import './MealTypeSelector.css';

export default function MealTypeSelector({ onSelect }) {
  const [selected, setSelected] = useState(null);

  const handleClick = (type) => {
    setSelected(type);
    onSelect(type);
  };

  return (
    <div className="meal-type-selector">
      <h2>Do you want to eat something home-cooked or order takeout?</h2>
      <div className="button-row">
        <button onClick={() => handleClick("Home-Cooked")}>Home-Cooked</button>
        <button onClick={() => handleClick("Takeout")}>Takeout</button>
      </div>
    </div>
  );
}
