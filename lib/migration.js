// ============================================================
// lib/migration.js — JJTT Migration 적재 모듈
// 기존 webhook.js와 동일한 CommonJS / env 사용
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// 이름 마스킹 — 원본 이름은 어디에도 저장하지 않음
// 김지수 → 김*수 / 박준 → 박* / 남궁민수 → 남**수
function maskName(name) {
  if (!name || name.length < 2) return '익명';
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

// 상품명에서 모델 추출 — TODO: 실제 8종 모델명으로 교체
const MODEL_KEYWORDS = ['아델리펭귄', '동박새', '물총새', '쇠백로', '파랑새', '까치', '제비', '올빼미'];
function extractModel(productName = '') {
  return MODEL_KEYWORDS.find(k => productName.includes(k)) || 'JJTT';
}

// payload 구조가 케이스마다 달라 여러 경로로 시도
function extractReceiverName(resource) {
  return (
    resource?.receivers?.[0]?.name ||
    resource?.receiver_name ||
    resource?.buyer_name ||
    resource?.member_name ||
    ''
  );
}

// 주문 → 새 추가 (카테고리당 1마리, 중복 자동 무시)
async function recordMigration({ orderId, resource, categories }) {
  try {
    const receiverName = extractReceiverName(resource);
    // 수령인명이 payload에 실제로 오는지 확인용 — 확인 후 이 로그는 지워도 됨
    if (!receiverName) console.log('[migration] 수령인명 없음, payload 키:', Object.keys(resource || {}));

    const rows = categories.map(({ cat, productName }) => ({
      order_id: orderId,
      masked_name: maskName(receiverName),
      product_model: extractModel(productName),
      donation_category: cat, // cat1~cat4 그대로
      ordered_at: resource?.order_date || new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('migration_orders')
      .upsert(rows, { onConflict: 'order_id,donation_category', ignoreDuplicates: true });

    if (error) console.error('[migration] insert 실패:', error.message);
  } catch (e) {
    // migration 실패가 기부 카운팅을 막으면 안 됨 — throw하지 않음
    console.error('[migration] error:', e);
  }
}

// 주문 취소 → 새 제거
async function removeMigration(orderId) {
  try {
    const { error } = await supabase
      .from('migration_orders')
      .delete()
      .eq('order_id', orderId);
    if (error) console.error('[migration] delete 실패:', error.message);
  } catch (e) {
    console.error('[migration] error:', e);
  }
}

module.exports = { recordMigration, removeMigration };
