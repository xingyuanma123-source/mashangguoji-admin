-- 00009_privatize_receipt_buckets.sql
-- 图片彻底私有化（item 3 升级）：把两个收据桶设为私有。
-- 之后公开直链全部失效；显示改由云函数 driver-api 的 /storage/sign 签发 1 小时临时链接
-- （service_role 签名，兼容旧桶 app-a2kae62wkbnl_receipt_images 与新桶 receipt-images 的历史 URL）。
--
-- 已于 2026-06-07 在生产应用。
-- 说明：上传仍保留 anon 直传（私有桶 + 既有 INSERT 策略），仅"读"被彻底关闭；
--      如需连"写"也禁掉 anon，可改走 /storage/sign-upload 签名上传并删除该 INSERT 策略。

UPDATE storage.buckets SET public = false
WHERE id IN ('receipt-images', 'app-a2kae62wkbnl_receipt_images');
