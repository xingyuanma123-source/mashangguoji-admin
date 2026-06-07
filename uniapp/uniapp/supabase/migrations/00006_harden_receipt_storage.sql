-- 00006_harden_receipt_storage.sql
-- 图片存储轻量加固（item 3）：
-- 收据桶仍为 public（个体直链照常可访问、不破坏已有链接），但移除"可列举/可乱传"权限。
--
-- 现状说明：
--   receipt-images（小程序在用）本就只有 INSERT 策略、无 SELECT 策略 → 无法枚举，保持不动。
--   app-a2kae62wkbnl_receipt_images（旧脚手架桶，已弃用）原有：
--     - SELECT (public 全桶) → 任何人可列举/批量下载  ← 风险
--     - INSERT (public 全桶) → 任何人可上传            ← 风险
-- 本迁移移除上述两条策略。

DROP POLICY IF EXISTS "所有人可以查看凭证图片" ON storage.objects;
DROP POLICY IF EXISTS "所有人可以上传凭证图片" ON storage.objects;
