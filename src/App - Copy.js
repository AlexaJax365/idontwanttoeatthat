import React, { useState } from 'react';
import CuisineSelector from './components/CuisineSelector';
import MealTypeSelector from './components/MealTypeSelector';

function App() {
  const [showMealType, setShowMealType] = useState(false);
  const [mealType, setMealType] = useState('');

  const handleCuisineNext = () => {
    setShowMealType(true);
  };

  const handleMealTypeSelect = (type) => {
    setMealType(type);
    alert(`You chose: ${type}`);
  };

  return (
    <div>
      <h1>I Don’t Want to Eat That</h1>
      {!showMealType ? (
        <CuisineSelector onNext={handleCuisineNext} />
      ) : (
        <MealTypeSelector onSelect={handleMealTypeSelect} />
      )}
    </div>
  );
}

export default App;
