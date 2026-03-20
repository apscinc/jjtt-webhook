export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL이 필요합니다' });

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await response.text();

    const get = (property) => {
      const match = html.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'))
                 || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, 'i'));
      return match ? match[1] : null;
    };

    res.status(200).json({
      thumbnail_url: get('og:image'),
      title: get('og:title'),
      description: get('og:description'),
    });
  } catch (e) {
    res.status(500).json({ error: '페이지를 불러올 수 없습니다' });
  }
}
