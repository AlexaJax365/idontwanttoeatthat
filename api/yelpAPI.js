// Serverless function on Vercel to call Yelp API securely

const axios = require("axios/dist/node/axios.cjs");

// Map human-friendly cuisine names to Yelp API category codes
const categoryMap = {
  Italian: "italian",
  Japanese: "japanese",
  Indian: "indpak",
  Mexican: "mexican",
  Korean: "korean",
  Thai: "thai",
  American: "tradamerican",
  Vietnamese: "vietnamese",
  Chinese: "chinese",
  Mediterranean: "mediterranean",
  Greek: "greek",
  French: "french",
  Spanish: "spanish",
  Filipino: "filipino",
  MiddleEastern: "mideastern",
  FastFood: "hotdogs"
};

export default async function handler(req, res) {
  const apiKey = process.env.YELP_API_KEY;
  if (!apiKey) {
    console.error("❌ Missing Yelp API Key");
    return res.status(500).json({ error: "Missing Yelp API Key" });
  }

  // removed categories = "" code
  const {
    term = "restaurants",
    latitude,
    longitude,
    location = "New York",
    limit = 10,
    rejected = ""
  } = req.query;

  // Determine which categories to include based on rejections
  const rejectedList = rejected.split(',').map(r => r.trim().toLowerCase());
  const acceptedList = req.query.accepted?.split(',').map(item => item.trim().toLowerCase()) || [];
  const allCategories = Object.values(categoryMap);
  const includedCategories = allCategories.filter(cat => {
    const name = Object.keys(categoryMap).find(key => categoryMap[key] === cat);
    return !rejectedList.includes(name.toLowerCase());
  });

  const categories = includedCategories.join(",");

  // Construct query params
  const params = {
    term,
    categories,
    limit
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

    const acceptedList = req.query.accepted?.split(',').map(item => item.trim().toLowerCase()) || [];

    const filteredBusinesses = response.data.businesses.filter(biz => {
      const bizCategories = biz.categories.map(c => c.title.toLowerCase());
      return bizCategories.some(cat => acceptedList.includes(cat));
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
