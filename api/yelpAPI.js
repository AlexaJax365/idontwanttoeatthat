// Serverless function on Vercel to call Yelp API securely

export default async function handler(req, res) {
  const axios = require("axios");

  const apiKey = process.env.YELP_API_KEY;
  if (!apiKey) {
    console.error("❌ Missing Yelp API Key");
    return res.status(500).json({ error: "Missing Yelp API Key" });
  }

  const {
    term = "restaurants",
    latitude,
    longitude,
    location = "New York", // fallback if no coordinates
    categories = "",
    limit = 10,
  } = req.query;

  // Build query parameters
  const params = {
    term,
    categories,
    limit,
  };

  // Use geolocation if available, otherwise fallback to location
  if (latitude && longitude) {
    params.latitude = latitude;
    params.longitude = longitude;
  } else {
    params.location = location;
  }

  try {
    const response = await axios.get("https://api.yelp.com/v3/businesses/search", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      params,
    });

    res.status(200).json(response.data.businesses);
  } catch (error) {
    const msg = error.response?.data || error.message;
    console.error("❌ Yelp API Error:", msg);
    res.status(500).json({ error: "Failed to fetch data from Yelp", details: msg });
  }
}
