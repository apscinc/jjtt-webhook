// ============================================================
// JJTT 관리자 수동 조정 API
// 카테고리별 +1 / -1 처리
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { cat_id, action } = req.body;

    if (!cat_id || !action) {
      return res.status(400).json({ error: 'cat_id, action 필요' });
    }

    if (!['increment_count', 'decrement_count'].includes(action)) {
      return res.status(400).json({ error: '올바르지 않은 action' });
    }

    const { error } = await supabase.rpc(action, { cat_id });
    if (error) throw error;

    // 관리자 로그 저장
    await supabase.from('donation_logs').insert({
      order_id: 'admin-' + Date.now(),
      category: cat_id,
      option_value: 'manual',
      action: action === 'increment_count' ? 'admin_plus' : 'admin_minus',
    });

    console.log(`[ADMIN] ${action} for ${cat_id}`);
    return res.status(200).json({ success: true, cat_id, action });

  } catch (err) {
    console.error('Adjust error:', err);
    return res.status(500).json({ error: err.message });
  }
};
