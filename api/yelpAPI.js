// /api/yelpAPI.js
const axios = require("axios/dist/node/axios.cjs");

export default async function handler(req, res) {
  const apiKey = process.env.YELP_API_KEY;
  if (!apiKey) {
    console.error("❌ Missing Yelp API Key");
    return res.status(500).json({ error: "Missing Yelp API Key" });
  }

  const {
    term = "food",
    latitude,
    longitude,
    location = "New York",
    limit = 40,
    accepted = "",
  } = req.query;

  const params = {
    term,
    limit: Number(limit),
    sort_by: "distance",
  };

  if (latitude && longitude) {
    params.latitude = parseFloat(latitude);
    params.longitude = parseFloat(longitude);
    params.radius = 16000; // ~10 miles
  } else {
    params.location = location;
  }

  // Handle accepted cuisines using raw Yelp aliases (dynamic, not mapped)
  if (accepted) {
    const acceptedList = accepted.split(',').map(a => a.trim().toLowerCase());
    params.categories = acceptedList.join(",");
  }

  try {
    const response = await axios.get("https://api.yelp.com/v3/businesses/search", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      params,
    });

    const businesses = response.data.businesses || [];

    if (businesses.length === 0 && params.radius < 32000) {
      // Retry with wider radius if no results and we're still under a max cap
      params.radius = 32000; // Expand to ~20 miles
      const retryResponse = await axios.get("https://api.yelp.com/v3/businesses/search", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        params,
      });
      return res.status(200).json(retryResponse.data.businesses);
    }

    res.status(200).json(businesses);
  } catch (error) {
    const status = error.response?.status || 500;
    const rawData = error.response?.data;

    console.error("❌ Yelp API Error:", rawData || error.message);

    res.status(status).json({
      error: "Yelp API call failed",
      details: typeof rawData === "object" ? rawData : { message: String(rawData || error.message) },
    });
  }
}
