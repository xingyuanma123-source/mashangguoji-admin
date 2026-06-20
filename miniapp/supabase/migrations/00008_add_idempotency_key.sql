-- 00008_add_idempotency_key.sql
-- item 4：报账提交幂等。给 expense_records 加幂等键列 + 索引。
-- 云函数 driver-api 的 /records/create：同一 idempotency_key 已存在则直接返回原记录，
-- 不重复插入，杜绝弱网超时重试导致的重复报账。

ALTER TABLE public.expense_records ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE INDEX IF NOT EXISTS idx_expense_records_idempotency
  ON public.expense_records (driver_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
