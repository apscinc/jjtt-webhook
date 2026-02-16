// ============================================================
// JJTT 카페24 Webhook 수신 서버
// 주문 접수 → +1 / 취소 → -1 / 2000 달성 → 자동 리셋
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const GOAL = 2000;

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

// 2000 달성 체크 → 달성 시 리셋 + delivered +1 + 히스토리 기록
async function checkAndReset(cat) {
  const { data, error } = await supabase
    .from('donation_counts')
    .select('count, delivered')
    .eq('category', cat)
    .single();

  if (error || !data) return;
  if (data.count < GOAL) return;

  // 달성! 리셋 + delivered +1
  const newDelivered = data.delivered + 1;
  const { error: updateError } = await supabase
    .from('donation_counts')
    .update({
      count: data.count - GOAL,  // 초과분은 다음 라운드로 이월
      delivered: newDelivered,
      updated_at: new Date().toISOString(),
    })
    .eq('category', cat);

  if (updateError) {
    console.error('Reset error:', updateError);
    return;
  }

  // 히스토리 기록
  await supabase.from('donation_history').insert({
    category: cat,
    delivered_round: newDelivered,
    delivered_at: new Date().toISOString(),
  });

  console.log(`🎉 [GOAL] ${cat} reached ${GOAL}! Round ${newDelivered} delivered. Reset done.`);
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
      // +1 또는 -1
      const { error } = await supabase.rpc(action, { cat_id: cat });
      if (error) throw error;

      // 로그 저장
      await supabase.from('donation_logs').insert({
        order_id: orderId,
        category: cat,
        option_value: optionValue,
        action: logAction,
      });

      // 주문 시에만 달성 체크
      if (!isCancel) {
        await checkAndReset(cat);
      }

      console.log(`[${logAction}] ${cat} for order ${orderId}`);
    }

    return res.status(200).json({ success: true, orderId, action: logAction, categories });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
};
