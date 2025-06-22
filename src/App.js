import React, { useState } from 'react';
import CuisineSelector from './components/CuisineSelector';
import MealTypeSelector from './components/MealTypeSelector';
import MealSuggestions from './components/MealSuggestions';

function App() {
  const [step, setStep] = useState(1);
  const [mealType, setMealType] = useState("");
  const [rejectedCuisines, setRejectedCuisines] = useState([]);
  const [acceptedCuisines, setAcceptedCuisines] = useState([]);


  const goBack = () => setStep(prev => Math.max(1, prev - 1));

  return (
    <div>
      <h1>I Don’t Want to Eat That</h1>

      {/* Step 1: Meal Type Selection */}
      {step === 1 && (
        <MealTypeSelector
          onSelect={(type) => {
            setMealType(type.toLowerCase());
            setStep(2);
          }}
        />
      )}

      {/* Step 2: Cuisine Selector */}
      {step === 2 && (
        <div>
          <CuisineSelector
            onNext={(rejected,accepted) => {
              setRejectedCuisines(rejected);
	      setAcceptedCuisines(accepted);
              setStep(3);
            }}
          />
          <button onClick={goBack}>⬅ Back</button>
        </div>
      )}

      {/* Step 3: Meal Suggestions */}
      {step === 3 && (
        <div>
          <MealSuggestions
            rejectedCuisines={rejectedCuisines}
            acceptedCuisines={acceptedCuisines}
            mealType={mealType}
          />
          <button onClick={goBack}>⬅ Back</button>
        </div>
      )}
    </div>
  );
}

export default App;
