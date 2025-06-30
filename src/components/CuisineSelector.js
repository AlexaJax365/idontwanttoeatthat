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
          setLocation({ lat: 40.7128, lon: -74.0060 }); // fallback to NYC
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
          console.error("Failed to load dynamic categories", err);
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
    const currentTitles = currentBatch;
    setRejected(prev => [
      ...prev,
      ...currentTitles.filter(title => !prev.includes(title))
    ]);

    const nextIndex = batchIndex + 1;
    if (nextIndex * batchSize >= cuisines.length) {
      alert("No more cuisines left to show.");
    } else {
      setBatchIndex(nextIndex);
    }
  };

  const currentBatch = cuisines.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);

  return (
    <div>
      <h2>Tap the cuisines you DON’T want:</h2>
      <div className="cuisine-grid">
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
      <div style={{ marginTop: '1em' }}>
        <button onClick={nextBatch}>I don’t like any of these ⟳</button>
        <button onClick={() => {
          const shown = cuisines.slice(0, (batchIndex + 1) * batchSize);
          const accepted = shown.filter(title => !rejected.includes(title));
          onNext(rejected, accepted);
        }}>Next ➡</button>
      </div>
    </div>
  );
}
