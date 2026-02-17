// ============================================================
// JJTT 관리자 수동 조정 API
// +1 / -1 / +N / -N 지원
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const GOAL = 2000;

async function checkAndReset(cat) {
  const { data, error } = await supabase
    .from('donation_counts')
    .select('count, delivered')
    .eq('category', cat)
    .single();

  if (error || !data || data.count < GOAL) return;

  const newDelivered = data.delivered + 1;
  await supabase
    .from('donation_counts')
    .update({
      count: data.count - GOAL,
      delivered: newDelivered,
      updated_at: new Date().toISOString(),
    })
    .eq('category', cat);

  await supabase.from('donation_history').insert({
    category: cat,
    delivered_round: newDelivered,
    delivered_at: new Date().toISOString(),
  });

  console.log(`🎉 [ADMIN GOAL] ${cat} reached ${GOAL}! Round ${newDelivered}`);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { cat_id, action, value } = req.body;
    const count = parseInt(value) || 1; // value 없으면 1

    if (!cat_id || !action) {
      return res.status(400).json({ error: 'cat_id, action 필요' });
    }
    if (!['increment_count', 'decrement_count'].includes(action)) {
      return res.status(400).json({ error: '올바르지 않은 action' });
    }
    if (count < 1 || count > 9999) {
      return res.status(400).json({ error: '수량은 1~9999 사이여야 합니다' });
    }

    // count번 반복 처리
    for (let i = 0; i < count; i++) {
      const { error } = await supabase.rpc(action, { cat_id });
      if (error) throw error;
      // increment일 때만 골 체크
      if (action === 'increment_count') {
        await checkAndReset(cat_id);
      }
    }

    // 관리자 로그 저장
    await supabase.from('donation_logs').insert({
      order_id: 'admin-' + Date.now(),
      category: cat_id,
      option_value: 'manual x' + count,
      action: action === 'increment_count' ? 'admin_plus' : 'admin_minus',
    });

    console.log(`[ADMIN] ${action} x${count} for ${cat_id}`);
    return res.status(200).json({ success: true, cat_id, action, count });

  } catch (err) {
    console.error('Adjust error:', err);
    return res.status(500).json({ error: err.message });
  }
};
