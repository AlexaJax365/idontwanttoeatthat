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
    const categorySet = new Set();

    businesses.forEach(biz => {
      biz.categories.forEach(cat => {
        const title = cat.title.trim();
        const parentAliases = cat.parent_aliases || [];

        const isFoodRelated = parentAliases.some(alias =>
          ["restaurants", "food"].includes(alias)
        );

        if (isFoodRelated) {
          categorySet.add(title);
        }
      });
    });

    // Debug: log categories extracted before sending
    console.log("👉 Dynamic food-related categories:", Array.from(categorySet));

    res.status(200).json(Array.from(categorySet));
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
