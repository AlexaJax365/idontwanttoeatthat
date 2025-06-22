import React, { useEffect, useState } from 'react';

export default function CuisineSelector({ onNext }) {
  const [cuisines, setCuisines] = useState([]);
  const [rejected, setRejected] = useState([]);

  useEffect(() => {
    fetch("/api/yelpCategories")
      .then(res => res.json())
      .then(data => {
        const unique = Array.from(new Set(data.map(c => c.title)));
        setCuisines(unique.sort());
      })
      .catch(err => {
        console.error("Failed to load categories", err);
        setCuisines([]);
      });
  }, []);

  const toggleReject = (cuisine) => {
    setRejected(prev =>
      prev.includes(cuisine)
        ? prev.filter(item => item !== cuisine)
        : [...prev, cuisine]
    );
  };

  return (
    <div>
      <h2>Tap the cuisines you DON’T want:</h2>
      <div className="grid">
        {cuisines.map((cuisine, idx) => (
          <button
            key={idx}
            className={rejected.includes(cuisine) ? "rejected" : ""}
            onClick={() => toggleReject(cuisine)}
          >
            {cuisine}
          </button>
        ))}
      </div>
      <button onClick={() => onNext(rejected)}>Next ➡</button>
    </div>
  );
}
