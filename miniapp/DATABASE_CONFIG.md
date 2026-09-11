# 小程序数据库配置（当前说明）

核对日期：2026-09-12；依据 [客户端源码](src/client/supabase.ts) 和 [构建命令](package.json)。本页替代原先“在源码中硬编码 prod”的过期指引。

客户端读取构建期环境变量 `TARO_APP_SUPABASE_URL`、`TARO_APP_SUPABASE_ANON_KEY`、`TARO_APP_APP_ID`，缺少任何一项会报错。切换配置后需重新构建。

| 用途 | 命令 | 模式配置 | 目标库 |
| --- | --- | --- | --- |
| 日常开发 | `pnpm dev:staging` | `.env.staging` | staging：ovtnnahdqljqqkponvhu |
| 测试构建 | `pnpm build:staging` | `.env.staging` | staging：ovtnnahdqljqqkponvhu |
| 经批准的正式构建 | `pnpm build:prod` | `.env.production` | prod：rwjbladqwubgjotlygyy |

本地覆盖文件或进程环境也可能影响构建配置，最终须在微信开发者工具 Network 中确认请求域名。仅看到命令名字不能代替环境检查。

以 [.env.example](.env.example) 理解变量；小程序只能包含公开级 URL、anon 配置等，不能包含 service_role 或其他服务端管理密钥。

数据库结构变更和前端构建是两条独立流程。结构变更先读 [migration 台账](../docs/migrations-ledger.md)，再按负责人确认的方案操作。staging/prod 数据独立，不同步真实数据到测试库。

[返回快速开始](QUICK_START.md) · [文档导航](../docs/README.md)
