const axios = require("axios/dist/node/axios.cjs");

export default async function handler(req, res) {
  const apiKey = process.env.YELP_API_KEY;
  if (!apiKey) {
    console.error("❌ Missing Yelp API Key");
    return res.status(500).json({ error: "Missing Yelp API Key" });
  }

  const {
    latitude,
    longitude,
    location = "New York",
    limit = 50,
  } = req.query;

  const params = {
    term: "food",
    limit: Number(limit),
    sort_by: "distance",
  };

  if (latitude && longitude) {
    params.latitude = parseFloat(latitude);
    params.longitude = parseFloat(longitude);
  } else {
    params.location = location;
  }

  try {
    const response = await axios.get("https://api.yelp.com/v3/businesses/search", {
      headers: { Authorization: `Bearer ${apiKey}` },
      params,
    });

    const businesses = response.data.businesses || [];

    // Build dynamic category frequency map
    const categoryCounts = {};
    businesses.forEach(biz => {
      biz.categories.forEach(cat => {
        const title = cat.title.trim();
        const key = title.toLowerCase();
        if (!categoryCounts[key]) {
          categoryCounts[key] = { title, count: 0 };
        }
        categoryCounts[key].count += 1;
      });
    });

    // Filter out overly generic or noisy categories dynamically
    const dynamicNoise = ["food", "restaurant", "dining", "bars", "desserts", "cafes", "bakeries"];
    const filtered = Object.values(categoryCounts)
      .filter(catObj => {
        return !dynamicNoise.some(noise => catObj.title.toLowerCase().includes(noise));
      })
      .sort((a, b) => b.count - a.count);

    res.status(200).json(filtered.map(c => c.title));
  } catch (error) {
    const status = error.response?.status || 500;
    const rawData = error.response?.data;

    console.error("❌ Yelp Categories API Error:", rawData || error.message);

    res.status(status).json({
      error: "Failed to fetch Yelp categories",
      details: typeof rawData === "object" ? rawData : { message: String(rawData || error.message) },
    });
  }
}
