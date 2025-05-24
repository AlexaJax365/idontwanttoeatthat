import React, { useState } from 'react';
import CuisineSelector from './components/CuisineSelector';
import MealTypeSelector from './components/MealTypeSelector';
import MealSuggestions from './components/MealSuggestions';

function App() {
  const [step, setStep] = useState(1);
  const [mealType, setMealType] = useState("");
  const [rejectedCuisines, setRejectedCuisines] = useState([]);

  const goBack = () => setStep(prev => Math.max(1, prev - 1));

  return (
    <div>
      <h1>I Don’t Want to Eat That</h1>

      {step === 1 && (
  <CuisineSelector
    onNext={(rejected) => {
      setRejectedCuisines(rejected);
      setStep(2);
    }}
  />
)}

{step === 2 && (
  <div>
    <MealTypeSelector
      onSelect={(type) => {
        setMealType(type.toLowerCase());
        setStep(3);
      }}
    />
    <button onClick={goBack}>⬅ Back</button>
  </div>
)}

{step === 3 && (
  <div>
    <MealSuggestions
      rejectedCuisines={rejectedCuisines}
      mealType={mealType}
    />
    <button onClick={goBack}>⬅ Back</button>
  </div>
)}

export default App;
