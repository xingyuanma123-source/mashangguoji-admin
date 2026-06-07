-- 00010_lockdown_service_staff.sql
-- 锁死 anon 对 service_staff（客服/管理员账号，含明文密码）的访问。
-- 网页后台已改走 db-proxy(service_role)，BYPASSRLS 照常；anon 一律拒绝。
-- 已于 2026-06-07 在生产应用并验证：anon 读 service_staff 返回空。
--
-- 其余仍开放 anon 的表（vehicle_locations / driver_documents / vehicle_documents /
-- legal_reviews / operating_companies / operation_logs / vehicles_trailer /
-- truck_trailer_assignments）暂未锁：需先确认除网页 proxy 外无其它 anon 消费者
-- （尤其 vehicle_locations 可能有外部 GPS 设备以 anon 直接写入）。

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_staff'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.service_staff', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.service_staff ENABLE ROW LEVEL SECURITY;
