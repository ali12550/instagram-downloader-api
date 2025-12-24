export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = req.query.key;
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized. Invalid API key" });
  }

  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: "Missing Instagram URL" });
  }

  try {
    // Extract shortcode from URL
    const shortcodeMatch = url.match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (!shortcodeMatch) {
      return res.status(400).json({ error: "Invalid Instagram URL format" });
    }
    const shortcode = shortcodeMatch[1];

    // Try GraphQL method first
    const graphqlUrl = `https://www.instagram.com/api/graphql`;
    const formData = new URLSearchParams();
    formData.append('variables', JSON.stringify({ shortcode }));
    formData.append('doc_id', '10015901848480474');
    formData.append('lsd', 'AVqbxe3J_YA');

    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-IG-App-ID': '936619743392459',
        'X-FB-LSD': 'AVqbxe3J_YA',
        'X-ASBD-ID': '129477',
        'Sec-Fetch-Site': 'same-origin',
        'Origin': 'https://www.instagram.com',
        'Referer': 'https://www.instagram.com/'
      },
      body: formData.toString()
    });

    if (response.ok) {
      const json = await response.json();
      const media = json?.data?.xdt_shortcode_media;
      
      if (media) {
        const downloadUrls = [];
        
        // Handle carousel (multiple images/videos)
        if (media.edge_sidecar_to_children?.edges) {
          for (const edge of media.edge_sidecar_to_children.edges) {
            const node = edge.node;
            downloadUrls.push({
              url: node.video_url || node.display_url,
              type: node.is_video ? 'video' : 'image'
            });
          }
        } else {
          // Single item
          downloadUrls.push({
            url: media.video_url || media.display_url,
            type: media.is_video ? 'video' : 'image'
          });
        }

        return res.status(200).json({
          success: true,
          shortcode,
          caption: media.edge_media_to_caption?.edges?.[0]?.node?.text || '',
          thumbnail: media.display_url,
          downloads: downloadUrls
        });
      }
    }

    // Fallback: Try embed page scraping
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
    const embedResponse = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (embedResponse.ok) {
      const html = await embedResponse.text();
      const videoMatch = html.match(/"video_url":"([^"]+)"/);
      const imageMatch = html.match(/"display_url":"([^"]+)"/);
      
      if (videoMatch || imageMatch) {
        const url = videoMatch ? videoMatch[1].replace(/\\u0026/g, '&') : imageMatch[1].replace(/\\u0026/g, '&');
        return res.status(200).json({
          success: true,
          shortcode,
          downloads: [{
            url,
            type: videoMatch ? 'video' : 'image'
          }]
        });
      }
    }

    return res.status(404).json({ 
      error: "Could not extract media. The post may be private or deleted." 
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
}
