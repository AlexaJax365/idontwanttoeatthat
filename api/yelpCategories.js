// /api/yelpCategories.js
const axios = require("axios/dist/node/axios.cjs");

export default async function handler(req, res) {
  try {
    const response = await axios.get("https://api.yelp.com/v3/categories", {
      headers: {
        Authorization: `Bearer ${process.env.YELP_API_KEY}`,
      },
    });

    // Filter only relevant categories (like "restaurants")
    const cuisines = response.data.categories.filter(cat =>
      cat.parent_aliases.includes("restaurants")
    );

    res.status(200).json(cuisines);
  } catch (error) {
    console.error("❌ Yelp Categories API Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch Yelp categories" });
  }
}