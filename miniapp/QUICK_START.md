# 小程序快速开始

本页是当前启动入口，核对日期：2026-09-12。旧版“硬编码 prod / 可用 npm”的说明已被替换，历史内容仍可在 Git 历史中查看。

1. 准备 Node.js 20、pnpm 10.30.3 和微信开发者工具。
2. 在仓库的 `miniapp/` 目录执行：

```bash
pnpm install --frozen-lockfile
pnpm dev:staging
```

3. 微信开发者工具导入 `miniapp/` 目录；其中 `project.config.json` 已指定 `miniprogramRoot: dist/weapp/`。AppID 权限与测试账号由负责人安排。
4. 确认请求域名属于 staging 项目 `ovtnnahdqljqqkponvhu` 后，才填写测试数据。

提交前检查：

```bash
pnpm lint
pnpm build:staging
```

配置说明见 [数据库配置](DATABASE_CONFIG.md)，完整协作步骤见 [协作流程](https://github.com/xingyuanma123-source/mashangguoji-admin/blob/codex/collaboration-complete/docs/collaboration-guide.md)。工资/派遣等开发中功能的验收状态，以对应 PR 和负责人确认为准。

本页不作为生产发布手册。构建、上传源码、发布小程序是不同操作；发布需另经负责人确认。
