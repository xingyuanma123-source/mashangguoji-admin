# 协作规范

马上国际单仓库（webpage 网站 / uniapp 小程序 / supabase 后端）。所有改动走 **feature 分支 + PR**，不直接推 `main`。

## 仓库结构

> 当前存在 `webpage/webpage`、`uniapp/uniapp` 双层嵌套，将在「解套娃」阶段扁平化为 `webpage/`、`uniapp/`。

- `webpage/webpage/` — React + Vite 管理后台
- `uniapp/uniapp/` — Taro 微信小程序（司机端）
- `webpage/webpage/supabase/`、`uniapp/uniapp/supabase/` — 数据库 migration 与边缘函数

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

[Conventional Commits](https://www.conventionalcommits.org)：`类型(范围): 描述`，例 `feat(legal): 新增合同抽取`。范围常用 `legal` `agent` `uniapp` `backend` `supabase`。

## 工作流

1. 从最新 `main` 切分支：`git checkout main && git pull && git checkout -b feat/xxx`
2. 提交前自查：**不带 `.env`/密钥/`node_modules`/构建产物**（`.gitignore` 已覆盖，新增子服务请确认）。
3. push 并开 PR，填写模板。
4. 至少 1 人 review 通过、CI 通过后合并。
5. 优先 **Squash merge**，保持 `main` 历史线性整洁。

## 数据库变更

- migration 文件入库 **不会** 自动改动线上库；需显式 apply。
- PR 中务必注明：是否含 migration、需 apply 到哪个环境（staging / prod）。
- ⚠️ 目前 webpage 与 uniapp 两套 migration 指向同一个库，正在收敛为单一事实源，新增 migration 前请先沟通。

## 部署提醒

合并到 `main` 会触发 CI 自动构建并发布前端，相当于一次生产部署 —— 合并时请确认已准备好发布。
