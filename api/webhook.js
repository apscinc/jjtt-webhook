// ============================================================
// JJTT 카페24 Webhook 수신 서버
// 주문 접수 → +1 / 취소 → -1
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// 옵션명 → 카테고리 매핑
function detectCategory(optionValue) {
  if (!optionValue) return null;
  const v = optionValue.toString();
  if (v.includes('취약') || v.includes('아동') || v.includes('청소년') || v.includes('노인')) return 'cat1';
  if (v.includes('소방') || v.includes('구급')) return 'cat2';
  if (v.includes('노숙')) return 'cat3';
  if (v.includes('사회복지') || v.includes('복지사')) return 'cat4';
  return null;
}

// 주문 데이터에서 기부처 옵션 추출
function extractCategories(orderData) {
  const categories = [];
  try {
    const items = orderData?.items || orderData?.order_items || [];
    for (const item of items) {
      const options = item?.options || item?.product_options || [];
      for (const opt of options) {
        const val = opt?.value || opt?.option_value || opt?.name || '';
        const cat = detectCategory(val);
        if (cat) categories.push({ cat, optionValue: val });
      }
      if (typeof item?.option_value === 'string') {
        const cat = detectCategory(item.option_value);
        if (cat) categories.push({ cat, optionValue: item.option_value });
      }
    }
  } catch (e) {
    console.error('extractCategories error:', e);
  }
  return categories;
}

// 취소 이벤트인지 판별
function isCancelEvent(body) {
  const eventName = body?.event_no || body?.event || body?.resource?.status || '';
  const cancelKeywords = ['cancel', 'cancelled', '취소'];
  return cancelKeywords.some(k => eventName.toString().toLowerCase().includes(k));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cafe24-Signature');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    console.log('Webhook received:', JSON.stringify(body).slice(0, 500));

    const orderId = body?.order_id || body?.resource?.order_id || 'unknown';
    const isCancel = isCancelEvent(body);
    const categories = extractCategories(body?.resource || body);

    if (categories.length === 0) {
      console.log('No matching category found for order:', orderId);
      return res.status(200).json({ message: 'No matching category', orderId });
    }

    const action = isCancel ? 'decrement_count' : 'increment_count';
    const logAction = isCancel ? 'cancel' : 'order';

    for (const { cat, optionValue } of categories) {
      const { error } = await supabase.rpc(action, { cat_id: cat });
      if (error) throw error;

      await supabase.from('donation_logs').insert({
        order_id: orderId,
        category: cat,
        option_value: optionValue,
        action: logAction,
      });

      console.log(`[${logAction}] ${cat} for order ${orderId}`);
    }

    return res.status(200).json({ success: true, orderId, action: logAction, categories });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
};
