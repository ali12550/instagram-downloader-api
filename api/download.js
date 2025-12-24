export default function handler(req, res) {
  const apiKey = req.query.key;

  if (!apiKey || apiKey !== process.env.lovable12345haideri) {
    return res.status(401).json({
      error: "Unauthorized. Invalid API key"
    });
  }

  const url = req.query.url;

  if (!url) {
    return res.status(400).json({
      error: "Missing Instagram URL"
    });
  }

  // TEMP SUCCESS RESPONSE
  return res.status(200).json({
    success: true,
    message: "API key verified successfully",
    received_url: url
  });
}
