# 协作交接准备状态（2026-09-11）

## 已完成

- 仓库已核实为 Public；本地原有最新提交 b3d0a22 已在远端。
- 原有提交按开源说明、法律 AI、JT808、staging 配置、规划文档、工资 WIP 拆出六条 review 分支，保留原分支与旧提交。
- 新增公共 CI 修复分支 `codex/ci-collaboration`：隔离 Node/Vitest 测试、在存在 JT808 测试时执行它、修正小程序 lint 入口执行权限、去掉写入 /workspace 的历史构建步骤。
- 新增汇总分支 `codex/collaboration-complete` 和 `docs/collaboration-guide.md`，供交接查看。该汇总分支不是已发布版本，也不用于直接整体合并。
- 新增网页 `npm run dev:staging`，三个代理目标都验证为本机 4002/4003/4004；实际代理需由负责人安排 staging 配置。

## 本地验证

在独立 Git worktree、未复制本地 .env 的情况下，重新安装锁文件依赖后验证：

| 检查 | 结果 |
| --- | --- |
| webpage npm ci / lint / test / build | 通过；8 个测试文件，34 个测试 |
| agent-proxy npm ci / test | 通过；20 个测试 |
| db-proxy npm ci / test | 通过；15 个测试 |
| JT808 配置测试 | 通过；2 个测试 |
| miniapp pnpm install --frozen-lockfile | 通过；pnpm 10.30.3 |
| miniapp pnpm lint | 通过 Biome、类型检查及 H5 检查构建；三个 AST 自定义检查因没有 ast-grep 被脚本跳过 |
| miniapp pnpm build:staging | 通过 |
| staging Vite 配置解析 | 三条 /api 代理均为预期本机地址 |
| 定向敏感模式扫描 | 扫描当时 349 个跟踪文件，未发现私钥、service_role JWT、GitHub token 或 sk-proj 模式；并非完整历史审计 |

本地 Node.js 为 22.22.3；GitHub workflow 使用 Node.js 20，仍须以远端 CI 结果作为合并门槛。上述检查不是数据库/页面功能验收，没有执行 migration、导入脚本或部署。

## GitHub 设置与交接（验证后更新）

- 负责人完成二次验证后，页面显示 Branch protection rule settings saved；重新读取已保存表单核实规则。
- 已启用：要求 PR、至少 1 人审批、新提交使旧审批失效、四项 CI 检查成功、更新到最新 main、规则适用于管理员；保留禁止强推、禁止删除和线性历史。
- 已创建 #15–#23：CI、开源说明、法律 AI、JT808、staging 配置、规划文档、协作流程、工资草稿、派遣草稿。旧混合 PR #14 已关闭并注明替代 PR；保留原分支。
- #15–#23 的远端 CI 均已成功；#21 补充文档后的最新提交 134aee4 的四项检查亦全部成功（run 34591708411）。
- 工资、派遣继续作为 Draft/WIP，待负责人和协作者验收；不据此更新 prod。
- 协作流程：`docs/collaboration-guide.md`。源码已经在公开分支可见，但 PR 尚待另一位协作者审批，尚未合入 main，也未部署。
- 原工作目录中另一处操作留下的 JT808 测试修复亦已保存在远端 `codex/collaboration-readiness`；不覆盖或丢弃该工作。
