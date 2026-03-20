export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  let { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL이 필요합니다' });

  // 네이버 블로그 모바일 버전으로 변환
  url = url.replace('blog.naver.com', 'm.blog.naver.com');

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      }
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
