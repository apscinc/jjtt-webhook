// ============================================================
// JJTT 기부 현황 데이터 API
// 카운트 + 히스토리 함께 반환
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const CATEGORY_NAMES = {
  cat1: '취약계층 청소년·노인 지원',
  cat2: '소방·구급대 지원',
  cat3: '노숙인 지원',
  cat4: '사회복지 직업인 지원',
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 카운트 데이터
    const { data: counts, error: countError } = await supabase
      .from('donation_counts')
      .select('category, count, delivered, updated_at')
      .order('category');

    if (countError) throw countError;

    // 히스토리 데이터 (최신순)
    const { data: history, error: historyError } = await supabase
      .from('donation_history')
      .select('category, delivered_round, delivered_at')
      .order('delivered_at', { ascending: false });

    if (historyError) throw historyError;

    // 카운트 데이터 변환
    const result = {};
    for (const row of counts) {
      result[row.category] = {
        count: row.count,
        delivered: row.delivered,
        updatedAt: row.updated_at,
      };
    }

    // 히스토리 데이터 변환
    const historyResult = (history || []).map(row => ({
      category: row.category,
      categoryName: CATEGORY_NAMES[row.category] || row.category,
      round: row.delivered_round,
      deliveredAt: row.delivered_at,
    }));

    return res.status(200).json({
      success: true,
      data: result,
      history: historyResult,
    });

  } catch (err) {
    console.error('Status API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
