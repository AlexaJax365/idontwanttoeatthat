import React, { useState } from 'react';
import './MealTypeSelector.css';

export default function MealTypeSelector({ onSelect }) {
  const handleClick = (type) => {
    onSelect(type);
  };

  return (
    <div className="meal-type-selector">
      <h2>Do you want to eat something home-cooked or order takeout?</h2>
      <div className="button-row">
        <button onClick={() => handleClick("home")}>🍳 Home-Cooked</button>
        <button onClick={() => handleClick("takeout")}>🍔 Eat Out</button>
      </div>
    </div>
  );
}
