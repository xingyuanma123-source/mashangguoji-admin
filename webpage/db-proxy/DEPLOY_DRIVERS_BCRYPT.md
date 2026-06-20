# drivers 密码 bcrypt 化部署说明

## 背景

`drivers.password` 此前为明文存储。本次改动后：

- **driver-api（Supabase Edge Function）**：`passwordsMatch` 先判断存储值是否为 bcrypt 散列（`$2a/$2b/$2y$` 前缀）——是则 `bcrypt.compareSync`，否则走原有 sha256 timing-safe 明文比对；明文比对成功后自动将该司机密码升级为 bcrypt 写回（service role PATCH，失败只记日志不影响登录）。
- **db-proxy（管理端）**：`hashPasswordFields` 由仅 `service_staff` 扩展为 `SENSITIVE_TABLES`（`service_staff` + `drivers`），管理端新建司机 / 改密 / 重置密码时统一落 bcrypt，明文不再进库。

## 部署顺序（必须严格按此顺序）

> ⚠️ 若先部署 db-proxy，管理端写入的司机密码会是 bcrypt 散列，而线上旧版 driver-api 只会明文比对 → 这些司机无法登录。**必须先部署 driver-api。**

### 第 1 步：部署 driver-api

```bash
cd miniapp
supabase functions deploy driver-api
```

### 第 2 步：验证司机登录（明文 + bcrypt 双路径）

1. **明文路径 + 自动升级**：用一个现有司机账号（密码仍是明文）在小程序登录，应成功；随后用 service role 查库确认该行 `password` 已变为 `$2a$10$...` 开头的散列：
   ```sql
   select id, username, left(password, 7) from drivers where username = '<测试账号>';
   ```
2. **bcrypt 路径**：同一账号**再次登录**，应仍然成功（此时走 bcrypt 比对分支）。
3. 任一步失败：回滚 driver-api（重新部署上一版本），**不要继续第 3 步**。

### 第 3 步：部署 db-proxy

```bash
cd webpage/db-proxy
node --check server.js && node --test authorize.test.js   # 本地自检
pm2 restart ecosystem.config.js                            # 按实际进程管理方式重启
```

### 第 4 步：端到端验证

1. 管理端「司机管理」重置某测试司机密码为 `123456`，查库确认存的是 bcrypt 散列而非明文。
2. 该司机用 `123456` 在小程序登录成功。
3. 管理端新建司机后，该司机能正常登录。

## 存量数据说明

旧明文密码**不需要批量迁移**：司机下次登录成功时自动升级为 bcrypt。如需加速收敛，可在两步都部署后由管理端逐个重置密码，或另写一次性脚本（注意脚本须经 service role 直连，绕过 db-proxy 的密码字段防护）。
