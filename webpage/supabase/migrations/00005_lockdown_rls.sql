-- 00005_lockdown_rls.sql
-- 收回 anon / authenticated 对 public 模式的全部权限。
-- 管理端经 db-proxy（service_role），司机端经 driver-api Edge Function（service_role），
-- 二者均不受影响。deny 策略不可靠（permissive 策略之间是 OR 关系），改为直接 REVOKE。
-- 唯一例外：jt808-server 目前仍用 anon key 上报 GPS，保留 vehicle_locations 的 INSERT；
-- 待其切换到 service key 后，删除文末的例外段。

-- 1) 清理所有面向 anon/public 的宽松策略
DROP POLICY IF EXISTS "客服可以查看所有客服信息" ON service_staff;
DROP POLICY IF EXISTS "管理员可以插入客服" ON service_staff;
DROP POLICY IF EXISTS "管理员可以修改客服" ON service_staff;

DROP POLICY IF EXISTS "客服可以查看所有司机" ON drivers;
DROP POLICY IF EXISTS "客服可以插入司机" ON drivers;
DROP POLICY IF EXISTS "客服可以修改司机信息" ON drivers;

DROP POLICY IF EXISTS "客服可以查看所有车辆" ON vehicles;
DROP POLICY IF EXISTS "客服可以插入车辆" ON vehicles;
DROP POLICY IF EXISTS "客服可以修改车辆" ON vehicles;

DROP POLICY IF EXISTS "客服可以查看所有费用类型" ON fee_types;
DROP POLICY IF EXISTS "客服可以插入费用类型" ON fee_types;
DROP POLICY IF EXISTS "客服可以修改费用类型" ON fee_types;

DROP POLICY IF EXISTS "客服可以查看所有报账记录" ON expense_records;
DROP POLICY IF EXISTS "客服可以修改待确认的记录" ON expense_records;

DROP POLICY IF EXISTS "客服可以查看所有备用金记录" ON advance_fund_records;
DROP POLICY IF EXISTS "客服可以插入备用金记录" ON advance_fund_records;
DROP POLICY IF EXISTS "客服可以修改备用金记录" ON advance_fund_records;
DROP POLICY IF EXISTS "客服可以删除备用金记录" ON advance_fund_records;

DROP POLICY IF EXISTS "客服可以查看所有日志" ON operation_logs;
DROP POLICY IF EXISTS "客服可以插入日志" ON operation_logs;
DROP POLICY IF EXISTS "允许插入日志" ON operation_logs;
DROP POLICY IF EXISTS "允许查看日志" ON operation_logs;

DROP POLICY IF EXISTS "allow all for anon" ON legal_reviews;
DROP POLICY IF EXISTS "operating_companies_anon_all" ON operating_companies;
DROP POLICY IF EXISTS "vehicles_trailer_anon_all" ON vehicles_trailer;
DROP POLICY IF EXISTS "truck_trailer_assignments_anon_all" ON truck_trailer_assignments;
DROP POLICY IF EXISTS "vehicle_documents_anon_all" ON vehicle_documents;
DROP POLICY IF EXISTS "driver_documents_anon_all" ON driver_documents;
DROP POLICY IF EXISTS "anon can read vehicle_locations" ON vehicle_locations;

-- expense_fee_details 在部分环境尚未创建
DO $$
BEGIN
  IF to_regclass('public.expense_fee_details') IS NOT NULL THEN
    DROP POLICY IF EXISTS "客服可以查看费用明细" ON expense_fee_details;
    DROP POLICY IF EXISTS "客服可以插入费用明细" ON expense_fee_details;
    DROP POLICY IF EXISTS "客服可以修改费用明细" ON expense_fee_details;
    DROP POLICY IF EXISTS "客服可以删除费用明细" ON expense_fee_details;
  END IF;
END $$;

-- 2) 收回权限（含 vehicles_sorted / trailers_sorted 视图），并阻断未来表的默认授权
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 3) GPS 上报例外（jt808-server 切换到 service key 后删除此段及对应策略）
GRANT INSERT ON vehicle_locations TO anon;
GRANT USAGE, SELECT ON SEQUENCE vehicle_locations_id_seq TO anon;
DROP POLICY IF EXISTS "anon can insert vehicle_locations" ON vehicle_locations;
CREATE POLICY "anon can insert vehicle_locations" ON vehicle_locations
  FOR INSERT TO anon WITH CHECK (true);
