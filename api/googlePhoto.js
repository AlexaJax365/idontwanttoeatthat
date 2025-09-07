// /api/googlephoto.js
export default async function handler(req, res) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).send("Missing GOOGLE_MAPS_API_KEY");

    const ref = req.query.ref;
    const w = Math.min(parseInt(req.query.maxwidth || req.query.w || "640", 10), 1600);
    if (!ref) return res.status(400).send("Missing required 'ref' (photo_reference)");

    // Build the Places Photos URL
    const params = new URLSearchParams({
      key: apiKey,
      photoreference: String(ref),
      maxwidth: String(isNaN(w) ? 640 : w)
    });
    const url = `https://maps.googleapis.com/maps/api/place/photo?${params.toString()}`;

    // Fetch the image (Google will 302 to a CDN; follow it and stream the bytes)
    const upstream = await fetch(url, { redirect: "follow", cache: "no-store" });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return res
        .status(502)
        .send(`Failed to fetch photo (status ${upstream.status}): ${text || "Unknown error"}`);
    }

    // Pass through content-type and cache headers for better perf
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const cacheControl =
      upstream.headers.get("cache-control") || "public, max-age=86400, s-maxage=86400";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", cacheControl);

    // Stream the image body to the client
    const arrayBuffer = await upstream.arrayBuffer();
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error("googlephoto proxy error:", err);
    res.status(500).send("Photo proxy error");
  }
}
