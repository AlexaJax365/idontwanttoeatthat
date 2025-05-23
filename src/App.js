import React, { useState } from 'react';
import CuisineSelector from './components/CuisineSelector';
import MealTypeSelector from './components/MealTypeSelector';
import MealSuggestions from './components/MealSuggestions';

function App() {
  const [step, setStep] = useState(1);
  const [mealType, setMealType] = useState("");
  const [rejectedCuisines, setRejectedCuisines] = useState([]);


  const goToNextStep = () => setStep(prev => prev + 1);

  const handleMealTypeSelect = (type) => {
    setMealType(type);           // Save the choice
    setStep(3);                  // Move to next step
  };

  return (
    <div>
      <h1>I Don’t Want to Eat That</h1>
      {step === 1 && (
  <CuisineSelector onNext={(rejected) => {
    setRejectedCuisines(rejected);
    goToNextStep();
  }} />
)}

      {step === 2 && (
	<MealTypeSelector onSelect={(type) => {
    	  setMealType(type.toLowerCase()); // save the choice as 'home' or 'takeout'
          setStep(3);
  }} />
)}

     {step === 3 && (
  <MealSuggestions
    rejectedCuisines={rejectedCuisines}
    mealType={mealType}
  />
)}
    </div>
  );
}

export default App;
