import React, { useEffect, useState } from 'react';
import './CuisineSelector.css';

export default function CuisineSelector({ onNext }) {
  const [cuisines, setCuisines] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [batchIndex, setBatchIndex] = useState(0);
  const [location, setLocation] = useState(null);

  const batchSize = 10;

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setLocation({ lat: latitude, lon: longitude });
        },
        () => {
          setLocation({ lat: 40.7128, lon: -74.0060 });
        }
      );
    } else {
      setLocation({ lat: 40.7128, lon: -74.0060 });
    }
  }, []);

  useEffect(() => {
    if (location) {
      fetch(`/api/yelpCategoriesByLocation?latitude=${location.lat}&longitude=${location.lon}`)
        .then(res => res.json())
        .then(data => setCuisines(data))
        .catch(err => {
          console.error("Failed to load categories", err);
          setCuisines([]);
        });
    }
  }, [location]);

  const toggleReject = (cuisine) => {
    setRejected(prev =>
      prev.includes(cuisine)
        ? prev.filter(item => item !== cuisine)
        : [...prev, cuisine]
    );
  };

  const nextBatch = () => {
    const nextIndex = batchIndex + 1;
    if (nextIndex * batchSize >= cuisines.length) {
      alert("No more cuisines left to show.");
    } else {
      setBatchIndex(nextIndex);
    }
  };

  // 🔥 All cuisines shown up to this point
  const shownCuisines = cuisines.slice(0, (batchIndex + 1) * batchSize);
  const currentBatch = cuisines.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);

  return (
    <div>
      <h2>Tap the cuisines you DON’T want:</h2>
      <div className="cuisine-grid">
        {currentBatch.map((cuisine, idx) => (
          <button
            key={idx}
            className={rejected.includes(cuisine.title) ? "rejected" : ""}
            onClick={() => toggleReject(cuisine.title)}
          >
            {cuisine.title}
          </button>
        ))}
      </div>
      <div style={{ marginTop: '1em' }}>
        <button onClick={nextBatch}>Show More ⟳</button>
        <button onClick={() => {
          const shownTitles = shownCuisines.map(c => c.title);
          const accepted = shownTitles.filter(title => !rejected.includes(title));
          onNext(rejected, accepted);
        }}>Next ➡</button>
      </div>
    </div>
  );
}
