// ============================================================
// JJTT 카페24 Webhook 수신 서버
// 카페24 주문 발생 시 기부 카테고리를 파악해서 Supabase에 저장
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
      // 옵션 배열 탐색
      const options = item?.options || item?.product_options || [];
      for (const opt of options) {
        const val = opt?.value || opt?.option_value || opt?.name || '';
        const cat = detectCategory(val);
        if (cat) categories.push({ cat, optionValue: val });
      }

      // 옵션이 문자열로 들어오는 경우
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

module.exports = async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cafe24-Signature');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    console.log('Webhook received:', JSON.stringify(body).slice(0, 500));

    const orderId = body?.order_id || body?.resource?.order_id || 'unknown';
    const categories = extractCategories(body?.resource || body);

    if (categories.length === 0) {
      console.log('No matching category found for order:', orderId);
      return res.status(200).json({ message: 'No matching category', orderId });
    }

    // 카테고리별 카운트 업데이트
    for (const { cat, optionValue } of categories) {
      // 카운트 +1
      const { data, error } = await supabase.rpc('increment_count', { cat_id: cat });
      if (error) throw error;

      // 로그 저장
      await supabase.from('donation_logs').insert({
        order_id: orderId,
        category: cat,
        option_value: optionValue,
      });

      console.log(`Updated ${cat} for order ${orderId}`);
    }

    return res.status(200).json({ success: true, orderId, categories });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
};
