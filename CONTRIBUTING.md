# 协作规范

马上国际单仓库（webpage 网站 / miniapp 小程序 / supabase 后端）。所有改动走 **feature 分支 + PR**，不直接推 `main`。

## 仓库结构

- `webpage/` — React + Vite 管理后台
- `miniapp/` — Taro 微信小程序（司机端）
- `supabase/` — 唯一的数据库 migration（单一基线）/ seed / 边缘函数（webpage 与 miniapp 共用同一个库）

## 分支命名

`<类型>/<简短描述>`，类型与 commit 前缀一致：

| 前缀 | 用途 | 示例 |
|---|---|---|
| `feat/` | 新功能 | `feat/legal-agent` |
| `fix/` | 修复 | `fix/login-redirect` |
| `refactor/` | 重构（不改外部行为） | `refactor/flatten-dirs` |
| `chore/` | 杂项 / 构建 / 依赖 / CI | `chore/dev-workflow` |
| `docs/` | 文档 | `docs/deploy-guide` |

## Commit 规范

[Conventional Commits](https://www.conventionalcommits.org)：`类型(范围): 描述`，例 `feat(legal): 新增合同抽取`。范围常用 `legal` `agent` `miniapp` `backend` `supabase`。

## 工作流

1. 从最新 `main` 切分支：`git checkout main && git pull && git checkout -b feat/xxx`
2. 提交前自查：**不带 `.env`/密钥/`node_modules`/构建产物**（`.gitignore` 已覆盖，新增子服务请确认）。
3. push 并开 PR，填写模板。
4. 至少 1 人 review 通过、CI 通过后合并。
5. 优先 **Squash merge**，保持 `main` 历史线性整洁。

## 数据库变更

- migration 文件入库 **不会** 自动改动线上库；需显式 apply。
- PR 中务必注明：是否含 migration、需 apply 到哪个环境（staging / prod）。
- migration 已收敛为根 `supabase/` 单一事实源（基线由 prod schema 导出，零漂移验证通过）。新增 migration 一律加在此目录，时间戳命名。

## 环境与密钥矩阵

两个 Supabase 项目：**prod** = `rwjbladqwubgjotlygyy`，**staging** = `ovtnnahdqljqqkponvhu`（同库服务 webpage + miniapp）。

请求链路三层，按环境切换：

| 层 | 配置项 | prod | staging | 是否密钥 / 进 git |
|---|---|---|---|---|
| webpage 前端 | 走同源 `/api/*`，**环境无关** | （由 Nginx 反代决定）| （由 Nginx 反代决定）| 无 env，切换在 Nginx |
| miniapp | `TARO_APP_SUPABASE_URL`/`_ANON_KEY` | prod 库 / prod anon | staging 库 / staging anon | 公开级，提交（`.env.production`/`.env.staging`）|
| 代理层 | `SUPABASE_URL` | prod 库 | staging 库 | 非密钥 |
| 代理层 | `SUPABASE_SERVICE_KEY` | prod service_role | staging service_role | 🔒 **密钥，仅服务器 .env，绝不进 git** |
| 代理层 | `PORT` | db 3002 / agent 3003 | db 4002 / agent 4003 | 非密钥（ecosystem 配置）|
| agent-proxy | `LLM_API_KEY` / `SESSION_SECRET` | — | — | 🔒 **密钥，仅服务器 .env** |
| ocr-proxy | `TENCENT_SECRET_ID/KEY` | 共用（不连库）| 共用 | 🔒 **密钥，仅服务器 .env** |

构建：
- webpage：环境无关，一份构建；`pnpm build`。
- miniapp：`pnpm build:staging`（连 staging，开发者工具测试，同 appid）/ `pnpm build:prod`（连 prod，发布正式版）。

🔒 **铁律**：`service_role`、`LLM_API_KEY`、`TENCENT_SECRET_*`、`SESSION_SECRET` 等高权限密钥只存在于各环境**服务器的 `.env`**，从不进入 git、不进入对话；提交进 git 的 env 文件只能含**公开级**值（URL、anon/publishable key）。

## 部署提醒

合并到 `main` 只触发 CI 检查，不会自动部署前端或任何服务。prod 上线必须手动按 `docs/prod-release-runbook.md` 执行。
