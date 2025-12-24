export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Validate API key
  const apiKey = req.query.key;
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized. Invalid API key"
    });
  }

  // Validate URL
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({
      success: false,
      error: "Missing Instagram URL"
    });
  }

  // Validate it's an Instagram URL
  if (!url.includes('instagram.com')) {
    return res.status(400).json({
      success: false,
      error: "Invalid Instagram URL"
    });
  }

  try {
    // Extract shortcode from URL
    const shortcode = extractShortcode(url);
    if (!shortcode) {
      return res.status(400).json({
        success: false,
        error: "Could not extract content ID from URL"
      });
    }

    // Detect content type
    const contentType = detectContentType(url);

    // Try multiple methods to get download links
    let result = null;

    // Method 1: GraphQL API
    result = await tryGraphQLMethod(shortcode);

    // Method 2: Embed page fallback
    if (!result || result.urls.length === 0) {
      result = await tryEmbedMethod(shortcode);
    }

    // Method 3: Direct page scraping
    if (!result || result.urls.length === 0) {
      result = await tryDirectScraping(url);
    }

    if (result && result.urls.length > 0) {
      return res.status(200).json({
        success: true,
        data: {
          type: contentType,
          urls: result.urls,
          thumbnail: result.thumbnail || null,
          caption: result.caption || null
        }
      });
    }

    return res.status(404).json({
      success: false,
      error: "Could not extract download links. The content may be private or unavailable."
    });

  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({
      success: false,
      error: "Failed to process Instagram URL: " + error.message
    });
  }
}

// Extract shortcode from various Instagram URL formats
function extractShortcode(url) {
  const patterns = [
    /instagram\.com\/p\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/reels\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/tv\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/stories\/[^/]+\/(\d+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Detect content type from URL
function detectContentType(url) {
  if (url.includes('/reel/') || url.includes('/reels/')) return 'reel';
  if (url.includes('/stories/')) return 'story';
  if (url.includes('/tv/')) return 'igtv';
  return 'post';
}

// Method 1: Instagram GraphQL API
async function tryGraphQLMethod(shortcode) {
  try {
    const graphqlUrl = `https://www.instagram.com/graphql/query/?doc_id=10015901848480474&variables=${encodeURIComponent(JSON.stringify({ shortcode }))}`;
    
    const response = await fetch(graphqlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.instagram.com/',
        'Origin': 'https://www.instagram.com'
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const media = data?.data?.xdt_shortcode_media;
    
    if (!media) return null;

    const urls = [];
    let thumbnail = null;
    let caption = media.edge_media_to_caption?.edges?.[0]?.node?.text || null;

    // Handle carousel (multiple items)
    if (media.edge_sidecar_to_children?.edges) {
      for (const edge of media.edge_sidecar_to_children.edges) {
        const node = edge.node;
        if (node.video_url) {
          urls.push({ type: 'video', url: node.video_url });
        } else if (node.display_url) {
          urls.push({ type: 'image', url: node.display_url });
        }
      }
      thumbnail = media.display_url;
    } else {
      // Single item
      if (media.video_url) {
        urls.push({ type: 'video', url: media.video_url });
      } else if (media.display_url) {
        urls.push({ type: 'image', url: media.display_url });
      }
      thumbnail = media.display_url;
    }

    return { urls, thumbnail, caption };
  } catch (error) {
    console.error('GraphQL method failed:', error);
    return null;
  }
}

// Method 2: Embed page scraping
async function tryEmbedMethod(shortcode) {
  try {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
    
    const response = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) return null;

    const html = await response.text();
    const urls = [];

    // Find video URLs
    const videoMatches = html.match(/https:\/\/[^"'\s]+\.mp4[^"'\s]*/gi);
    if (videoMatches) {
      const uniqueVideos = [...new Set(videoMatches)];
      uniqueVideos.forEach(url => {
        const cleanUrl = url.replace(/\\u0026/g, '&').replace(/\\/g, '');
        urls.push({ type: 'video', url: cleanUrl });
      });
    }

    // Find image URLs
    const imageMatches = html.match(/https:\/\/[^"'\s]*scontent[^"'\s]*\.jpg[^"'\s]*/gi);
    if (imageMatches && urls.length === 0) {
      const uniqueImages = [...new Set(imageMatches)];
      uniqueImages.slice(0, 1).forEach(url => {
        const cleanUrl = url.replace(/\\u0026/g, '&').replace(/\\/g, '');
        urls.push({ type: 'image', url: cleanUrl });
      });
    }

    // Extract thumbnail
    const thumbnailMatch = html.match(/<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]+src="([^"]+)"/);
    const thumbnail = thumbnailMatch ? thumbnailMatch[1].replace(/&amp;/g, '&') : null;

    return { urls, thumbnail, caption: null };
  } catch (error) {
    console.error('Embed method failed:', error);
    return null;
  }
}

// Method 3: Direct page scraping
async function tryDirectScraping(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': ''
      }
    });

    if (!response.ok) return null;

    const html = await response.text();
    const urls = [];

    // Try to find video URL in meta tags
    const videoMetaMatch = html.match(/<meta[^>]+property="og:video"[^>]+content="([^"]+)"/);
    if (videoMetaMatch) {
      urls.push({ type: 'video', url: videoMetaMatch[1] });
    }

    // Try to find image URL in meta tags
    const imageMetaMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
    const thumbnail = imageMetaMatch ? imageMetaMatch[1] : null;
    
    if (urls.length === 0 && imageMetaMatch) {
      urls.push({ type: 'image', url: imageMetaMatch[1] });
    }

    return { urls, thumbnail, caption: null };
  } catch (error) {
    console.error('Direct scraping failed:', error);
    return null;
  }
}
