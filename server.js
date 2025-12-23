require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Simple API key middleware
app.use((req, res, next) => {
  const apiKey = req.query.key;
  if (!apiKey || apiKey !== process.env.prj_ENsseI0FKqFyS9Gk93A8y3HEp0nv) {
    return res.status(401).json({ error: 'Unauthorized. Invalid API key.' });
  }
  next();
});
 
// API endpoint to download Instagram media
app.get('/download', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing Instagram URL.' });

  try {
    // Example: Instagram public post JSON (public posts only)
    const response = await axios.get(`https://www.instagram.com/p/${url}/?__a=1&__d=dis`);
    const data = response.data;

    // Return simplified media info
    res.json({
      media: data.graphql.shortcode_media,
      message: 'Instagram media fetched successfully'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Instagram media.' });
  }
});

app.listen(PORT, () => console.log(`API running on port ${PORT}`));
