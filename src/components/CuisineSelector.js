// src/components/CuisineSelector.js
import React, { useEffect, useState } from 'react';

export default function CuisineSelector({ onNext }) {
  const [cuisines, setCuisines] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [batchIndex, setBatchIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const batchSize = 10;

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          fetch(`/api/yelpCategoriesByLocation?lat=${latitude}&lon=${longitude}`)
            .then(res => res.json())
            .then(data => {
              setCuisines(data);
              setLoading(false);
            })
            .catch(err => {
              console.error("Failed to load categories", err);
              setLoading(false);
            });
        },
        () => {
          console.warn("Location denied. Using fallback.");
          fetch(`/api/yelpCategoriesByLocation?lat=40.7128&lon=-74.0060`)
            .then(res => res.json())
            .then(data => {
              setCuisines(data);
              setLoading(false);
            })
            .catch(err => {
              console.error("Failed to load fallback categories", err);
              setLoading(false);
            });
        }
      );
    }
  }, []);

  const currentBatch = cuisines.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);

  const toggleReject = (cuisine) => {
    setRejected(prev =>
      prev.includes(cuisine)
        ? prev.filter(item => item !== cuisine)
        : [...prev, cuisine]
    );
  };

  const handleNext = () => {
    if (rejected.length >= cuisines.length) {
      alert("You've rejected all available options.");
    } else if (currentBatch.every(c => rejected.includes(c))) {
      setBatchIndex(prev => prev + 1);
    } else {
      const remaining = currentBatch.filter(c => !rejected.includes(c));
      onNext(rejected, remaining);
    }
  };

  return (
    <div>
      <h2>Tap the cuisines you DON’T want:</h2>
      {loading ? (
        <p>Loading nearby cuisines...</p>
      ) : (
        <div className="grid">
          {currentBatch.map((cuisine, idx) => (
            <button
              key={idx}
              className={rejected.includes(cuisine) ? "rejected" : ""}
              onClick={() => toggleReject(cuisine)}
            >
              {cuisine}
            </button>
          ))}
        </div>
      )}
      <button onClick={handleNext}>Next ➡</button>
    </div>
  );
}
