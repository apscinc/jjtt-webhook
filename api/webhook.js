// ============================================================
// JJTT 카페24 Webhook 수신 서버
// 주문 접수 → +N / 취소 → -N / 2000 달성 → 자동 리셋
// 주문/취소 모두 중복 방지, 수량 반영
// + Migration: 주문 1건 = 새 1마리 적재          [추가됨]
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const { recordMigration, removeMigration } = require('../lib/migration.js'); // [추가됨]

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const GOAL = 2000;

function detectCategory(optionValue) {
  if (!optionValue) return null;
  const v = optionValue.toString();
  if (v.includes('취약') || v.includes('아동') || v.includes('청소년') || v.includes('노인')) return 'cat1';
  if (v.includes('소방') || v.includes('구급')) return 'cat2';
  if (v.includes('노숙')) return 'cat3';
  if (v.includes('사회복지') || v.includes('복지사')) return 'cat4';
  return null;
}

function extractCategories(orderData) {
  const categories = [];
  try {
    const items = orderData?.items || orderData?.order_items || [];
    for (const item of items) {
      const optionValue = item?.option_value || '';
      const qty = parseInt(item?.qty) || 1;
      const productName = item?.product_name || item?.product_name_default || ''; // [추가됨]
      const cat = detectCategory(optionValue);
      if (cat) categories.push({ cat, optionValue, qty, productName });

      // 기존 방식 (options 배열)
      const options = item?.options || item?.product_options || [];
      for (const opt of options) {
        const val = opt?.value || opt?.option_value || opt?.name || '';
        const c = detectCategory(val);
        if (c) categories.push({ cat: c, optionValue: val, qty, productName });
      }
    }
  } catch (e) {
    console.error('extractCategories error:', e);
  }
  return categories;
}

function isCancelEvent(body) {
  const eventName = body?.event_no || body?.event || body?.resource?.status || '';
  const cancelKeywords = ['cancel', 'cancelled', '취소'];
  return cancelKeywords.some(k => eventName.toString().toLowerCase().includes(k));
}

async function adjustCount(cat, qty) {
  // qty만큼 반복해서 increment
  for (let i = 0; i < qty; i++) {
    const { error } = await supabase.rpc('increment_count', { cat_id: cat });
    if (error) throw error;
    await checkAndReset(cat);
  }
}

async function decrementCount(cat, qty) {
  for (let i = 0; i < qty; i++) {
    const { error } = await supabase.rpc('decrement_count', { cat_id: cat });
    if (error) throw error;
  }
}

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

  console.log(`🎉 [GOAL] ${cat} reached ${GOAL}! Round ${newDelivered} delivered.`);
}

async function isDuplicate(orderId, action) {
  const { data } = await supabase
    .from('donation_logs')
    .select('id')
    .eq('order_id', orderId)
    .eq('action', action)
    .limit(1);
  return data && data.length > 0;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cafe24-Signature');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    const orderId = body?.order_id || body?.resource?.order_id || 'unknown';
    const isCancel = isCancelEvent(body);
    const categories = extractCategories(body?.resource || body);
    const logAction = isCancel ? 'cancel' : 'order';

    if (categories.length === 0) {
      console.log('No matching category for order:', orderId);
      return res.status(200).json({ message: 'No matching category', orderId });
    }

    // 중복 체크
    const duplicate = await isDuplicate(orderId, logAction);
    if (duplicate) {
      console.log(`⚠️ 중복 [${logAction}] 무시: ${orderId}`);
      return res.status(200).json({ message: 'Already processed', orderId, action: logAction });
    }

    for (const { cat, optionValue, qty } of categories) {
      if (isCancel) {
        await decrementCount(cat, qty);
      } else {
        await adjustCount(cat, qty);
      }

      await supabase.from('donation_logs').insert({
        order_id: orderId,
        category: cat,
        option_value: optionValue,
        action: logAction,
      });

      console.log(`[${logAction}] ${cat} x${qty} for order ${orderId}`);
    }

    // ── Migration: 새 추가/제거 ── [추가됨]
    // 기부 카운팅이 전부 끝난 뒤 호출. 실패해도 위 로직에 영향 없음
    if (isCancel) {
      await removeMigration(orderId);
    } else {
      await recordMigration({ orderId, resource: body?.resource || body, categories });
    }

    return res.status(200).json({ success: true, orderId, action: logAction, categories });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
};
