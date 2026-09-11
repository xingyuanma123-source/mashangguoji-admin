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

## 尚待完成，暂不宣称已交接完毕

- 保存 main 保护规则时 GitHub 要求账号二次验证；已交给负责人处理，尚未确认保存成功。
- 目标规则：要求 PR、至少 1 人审批、新提交使旧审批失效、四项 CI 检查成功、更新到最新 main、规则适用于管理员；保留禁止强推、禁止删除和线性历史。
- 还需创建各拆分 PR 并等待远端 CI；旧 PR #14 内容已扩展，不应按旧的“仅文档”说明直接合并。创建替代 PR 后再关闭旧 PR，保留原分支。
- 工资、派遣继续作为 Draft/WIP，待负责人和协作者验收；不据此更新 prod。
- `docs/collaboration-guide.md` 可在完成以上 GitHub 配置后转发；此前只作为草稿。
