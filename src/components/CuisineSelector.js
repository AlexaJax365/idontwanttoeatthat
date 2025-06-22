import React, { useEffect, useState } from 'react';
import './CuisineSelector.css'; // Make sure this exists and includes .rejected styling

export default function CuisineSelector({ onNext }) {
  const [cuisines, setCuisines] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [batchIndex, setBatchIndex] = useState(0);
  const [location, setLocation] = useState(null); // null initially

  const batchSize = 10;

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setLocation({ lat: latitude, lon: longitude });
        },
        () => {
          // fallback to NYC
          setLocation({ lat: 40.7128, lon: -74.0060 });
        }
      );
    } else {
      setLocation({ lat: 40.7128, lon: -74.0060 }); // fallback if not supported
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
        <button onClick={() => onNext(rejected)} style={{ marginLeft: '1em' }}>Next ➡</button>
      </div>
    </div>
  );
}
