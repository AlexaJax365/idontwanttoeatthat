// This is a serverless function on Vercel to call Yelp API securely
export default async function handler(req, res) {
  const axios = require('axios');

  const { term = "restaurants", location = "New York", categories = "", limit = 10 } = req.query;

  try {
    const response = await axios.get("https://api.yelp.com/v3/businesses/search", {
      headers: {
        Authorization: `Bearer ${process.env.YELP_API_KEY}`,
      },
      params: {
        term,
        location,
        categories,
        limit,
      },
    });

    res.status(200).json(response.data.businesses);
  } catch (error) {
    console.error("Yelp API Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch data from Yelp" });
  }
}
