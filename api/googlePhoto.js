// /api/googlePhoto.js
export default async function handler(req, res) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).send("Missing GOOGLE_MAPS_API_KEY");
    const { ref, maxwidth = 600 } = req.query;
    if (!ref) return res.status(400).send("Missing photo reference");

    const params = new URLSearchParams({
      key: apiKey,
      photoreference: String(ref),
      maxwidth: String(maxwidth),
    });

    const photoResp = await fetch(`https://maps.googleapis.com/maps/api/place/photo?${params}`);
    // The Places Photo API responds with a redirect to the actual image:
    if (photoResp.status === 302 || photoResp.redirected) {
      res.setHeader("Location", photoResp.url);
      return res.status(302).end();
    }

    // If not 302, stream the content:
    const arrayBuffer = await photoResp.arrayBuffer();
    res.setHeader("Content-Type", photoResp.headers.get("Content-Type") || "image/jpeg");
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (e) {
    console.error("googlePhoto error:", e);
    res.status(500).send("Failed to fetch photo");
  }
}
