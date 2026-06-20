-- 00007_lockdown_anon_miniapp_tables.sql
-- 锁死 anon：删除司机端 6 张表上所有放行策略，保持 RLS 开启。
-- 之后 anon / authenticated 无任何策略 → 一律拒绝；service_role（云函数 driver-api、
-- 网页 db-proxy）拥有 BYPASSRLS → 照常读写。这才真正关闭 item 1（密码暴露）/ item 2（财务篡改）。
--
-- 已于 2026-06-07 在生产应用；本文件作版本记录与重放依据。
-- 回滚参考：旧策略快照见本次提交说明 / git 历史（均为 USING(true) 的全放行策略，
-- 已无保留价值，回滚仅用于应急）。
--
-- ⚠️ 前置/配套：网页后台上线前必须改走 db-proxy(service_role)，否则这些表它也访问不了。
-- ⚠️ service_staff（客服密码）为同类问题，属网页端范畴，待其迁移后单独锁定。

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('drivers','vehicles','fee_types','expense_records','expense_other_fees','advance_fund_records')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_other_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_fund_records ENABLE ROW LEVEL SECURITY;
