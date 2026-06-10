// ============================================================
// migration.js — jjtt-webhook 프로젝트에 추가할 모듈
// 기존 기부 카운팅 핸들러에서 import해서 호출
// ============================================================
import { createClient } from "@supabase/supabase-js";

// 기존 웹훅이 쓰는 것과 같은 env (Vercel → Settings → Environment Variables)
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // anon 아님 — 쓰기는 service_role만
);

// 이름 마스킹: 원본은 어디에도 저장하지 않음
export function maskName(name) {
  if (!name || name.length < 2) return "익명";
  if (name.length === 2) return name[0] + "*";
  return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
}
// 김지수 → 김*수 / 박준 → 박* / 남궁민수 → 남**수

// 상품명에서 모델 추출 — 기부 카테고리 키워드 판별과 같은 방식
// TODO: 실제 8종 모델명으로 교체
const MODEL_KEYWORDS = ["아델리펭귄","동박새","물총새","쇠백로","파랑새","까치","제비","올빼미"];
export function extractModel(productName = "") {
  return MODEL_KEYWORDS.find(k => productName.includes(k)) || "JJTT";
}

/**
 * 기존 핸들러에서 기부 카운팅 처리 직후 호출:
 *
 *   import { recordMigration } from "./migration.js";
 *   await recordMigration({
 *     orderId:      order_id,            // 기존 dedup에 쓰는 그 값
 *     receiverName: receiver.name,       // payload의 수령인명
 *     productName:  item.product_name,
 *     catKey:       cat,                 // 'vulnerable'|'fire'|'homeless'|'worker'
 *     orderedAt:    order.order_date,
 *   });
 */
export async function recordMigration({ orderId, receiverName, productName, catKey, orderedAt }) {
  const { error } = await sb.from("migration_orders").upsert(
    {
      order_id: orderId,
      masked_name: maskName(receiverName),
      product_model: extractModel(productName),
      donation_category: catKey,
      ordered_at: orderedAt || new Date().toISOString(),
    },
    // 기존 기부 카운팅과 동일한 composite dedup — 재전송돼도 중복 안 생김
    { onConflict: "order_id,donation_category", ignoreDuplicates: true }
  );
  // migration 적재 실패가 기부 카운팅을 막으면 안 되므로 throw하지 않음
  if (error) console.error("[migration] insert 실패:", error.message);
}
