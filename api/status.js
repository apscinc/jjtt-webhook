// ============================================================
// JJTT 기부 현황 데이터 API
// 프론트엔드(donation 페이지)에서 호출해서 실시간 데이터 표시
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { data, error } = await supabase
      .from('donation_counts')
      .select('category, count, delivered, updated_at')
      .order('category');

    if (error) throw error;

    // 프론트엔드가 쓰기 쉬운 형태로 변환
    const result = {};
    for (const row of data) {
      result[row.category] = {
        count: row.count,
        delivered: row.delivered,
        updatedAt: row.updated_at,
      };
    }

    return res.status(200).json({ success: true, data: result });

  } catch (err) {
    console.error('Status API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
