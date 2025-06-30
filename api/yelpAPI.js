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
    categories = "",
    limit = 40,
    accepted = "",
  } = req.query;

  const baseParams = {
    term,
    limit: Number(limit),
    sort_by: "distance",
  };

  if (latitude && longitude) {
    baseParams.latitude = parseFloat(latitude);
    baseParams.longitude = parseFloat(longitude);
  } else {
    baseParams.location = location;
  }

  // Sanitize accepted cuisines
  if (accepted) {
    const acceptedList = accepted.split(',').map(a => a.trim().toLowerCase());
    baseParams.categories = acceptedList.join(",");
  }

  const radiusSteps = [8000, 16000, 24000, 32000]; // gradually increasing search radius in meters

  try {
    for (const radius of radiusSteps) {
      const params = { ...baseParams, radius };
      const response = await axios.get("https://api.yelp.com/v3/businesses/search", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        params,
      });

      const businesses = response.data.businesses || [];
      if (businesses.length > 0) {
        return res.status(200).json(businesses);
      }
    }

    // No results even at max radius
    return res.status(200).json([]);
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
