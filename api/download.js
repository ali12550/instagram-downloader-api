import express from "express";
import axios from "axios";

const app = express();

app.get("/api/download", async (req, res) => {
  try {
    const apiKey = req.query.key;
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: "Unauthorized. Invalid API key." });
    }

    // Example: dummy response for testing
    res.json({ message: "API works!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default app;
