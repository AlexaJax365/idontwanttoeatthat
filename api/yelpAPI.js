// Serverless function on Vercel to call Yelp API securely

const axios = require("axios/dist/node/axios.cjs");

const categoryMap = {
  "Indian": "indpak",
  "Mexican": "mexican",
  "Chinese": "chinese",
  "Thai": "thai",
  "Korean": "korean",
  "Japanese": "japanese",
  "Italian": "italian",
  "Vietnamese": "vietnamese",
  "American": "tradamerican",
  "Filipino": "filipino"
};

export default async function handler(req, res) {
  const apiKey = process.env.YELP_API_KEY;
  if (!apiKey) {
    console.error("❌ Missing Yelp API Key");
    return res.status(500).json({ error: "Missing Yelp API Key" });
  }

  const {
    term = "restaurants",
    latitude,
    longitude,
    location = "New York",
    categories = "",
    limit = 10,
  } = req.query;

  const rejectedList = rejected.split(',').map(r => r.trim());
  const allCategories = Object.values(categoryMap);
  const includedCategories = allCategories.filter(cat => {
    const name = Object.keys(categoryMap).find(key => categoryMap[key] === cat);
    return !rejectedList.includes(name);
  });

  const params = {
    term,
    categories,
    limit,
  };

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
    const status = error.response?.status || 500;
    const rawData = error.response?.data;

    console.error("❌ Yelp API Error:", rawData || error.message);

    res.status(status).json({
      error: "Yelp API call failed",
      details: typeof rawData === "object" ? rawData : { message: String(rawData || error.message) },
    });
  }
}
