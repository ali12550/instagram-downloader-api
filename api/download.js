import express from "express";

const app = express();

app.get("/", (req, res) => {
  const apiKey = req.query.key;

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      error: "Unauthorized. Invalid API key."
    });
  }

  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: "Missing Instagram URL" });
  }

  // Temporary response to confirm auth works
  res.json({
    success: true,
    message: "API key verified",
    received_url: url
  });
});

export default app;
