// /api/yelpCategoriesByLocation.js
const axios = require("axios/dist/node/axios.cjs");

export default async function handler(req, res) {
  const { latitude, longitude } = req.query;

  if (!latitude || !longitude) {
    return res.status(400).json({ error: "Missing latitude or longitude" });
  }

  try {
    const response = await axios.get("https://api.yelp.com/v3/businesses/search", {
      headers: {
        Authorization: `Bearer ${process.env.YELP_API_KEY}`,
      },
      params: {
        latitude,
        longitude,
        term: "restaurants",
        limit: 50,
      },
    });

    const businesses = response.data.businesses;

    const rawCategories = businesses.flatMap(biz =>
      biz.categories.map(cat => ({
        alias: cat.alias,
        title: cat.title,
      }))
    );

    // ✅ De-duplicate by alias and sanitize common duplicates like "Food"
    const seen = new Set();
    const filtered = rawCategories.filter(cat => {
      const key = cat.alias.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);

      // Optionally filter out generic labels
      const generic = ["restaurants", "food"];
      return !generic.includes(key);
    });

    res.status(200).json(filtered);
  } catch (error) {
    console.error("❌ Yelp Location Categories Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch location-based categories" });
  }
}
