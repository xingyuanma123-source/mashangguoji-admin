# 客服后台管理网页

用于管理司机报账、司机车辆、备用金及法律/OCR 相关业务。

[新手指南](../docs/START-HERE.md) · [完整协作流程](https://github.com/xingyuanma123-source/mashangguoji-admin/blob/codex/collaboration-complete/docs/collaboration-guide.md) · [服务分别做什么](../docs/SERVICES.md)

## 文件放在哪里

| 路径 | 用途 |
| --- | --- |
| `src/pages/` | 业务页面 |
| `src/features/` | 按业务模块组织的代码 |
| `src/components/` | 公共组件 |
| `src/contexts/` | 登录等共享状态 |
| `src/db/` | 数据访问封装 |
| `src/routes.tsx` | 页面路由 |
| `db-proxy/` | 数据库访问及后台会话 |
| `agent-proxy/` | 法律 AI 服务 |
| `ocr-proxy/` | OCR 识别服务 |
| `jt808-server/` | GPS 终端数据接收 |

数据库 migration 在仓库根目录 `supabase/migrations/`，不在本目录中。

## 本地开发

推荐在仓库根目录执行：

```bash
npm run setup
npm run dev
```

负责人配置好 `webpage/db-proxy/.env` 后，根目录启动命令会校验 staging、检查端口，再启动本机 4002 数据库代理和 5173 前端。Ctrl+C 同时退出。AI/OCR 按需另行配置，分别使用本机 4003/4004；查看 [服务说明](../docs/SERVICES.md)。

若只想启动前端，可在 `webpage/` 运行 `npm run dev` 或 `npm run dev:staging`，这两个入口均使用本机测试代理。实际密钥不能放进前端或 Git。

## 提交前

```bash
npm run lint
npm test
npm run build
```

涉及独立代理服务时，还需运行该服务自己的测试。详细命令见完整协作流程。

## 部署与设计文档

测试服务操作见 [staging 手册](../docs/staging-server-setup.md)，正式部署必须遵循 [上线手册](../docs/prod-release-runbook.md)，均需先与负责人确认。开发启动不等于部署。

业务设计、历史报告及维护资料统一从 [文档导航](../docs/README.md) 查找。
