-- ============================================================
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- increment_count 함수 (카운트 +1)
CREATE OR REPLACE FUNCTION increment_count(cat_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE donation_counts
  SET count = count + 1,
      updated_at = NOW()
  WHERE category = cat_id;
END;
$$ LANGUAGE plpgsql;

-- (선택) RLS 비활성화 - 서버에서만 접근하므로 안전
ALTER TABLE donation_counts DISABLE ROW LEVEL SECURITY;
ALTER TABLE donation_logs DISABLE ROW LEVEL SECURITY;
