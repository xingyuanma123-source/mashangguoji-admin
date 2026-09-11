# 马上国际：协作者开发流程

仓库：https://github.com/xingyuanma123-source/mashangguoji-admin （Public）

先接受 GitHub 协作者邀请。网页可以直接看代码；开发请 clone 仓库，后续用 Git 同步。项目负责人提供测试账号和所需的测试环境配置，不提供正式环境管理密钥。main 保护规则已保存并核实：PR、至少一人审批、四项 CI 检查、同步最新 main，管理员同样受约束。

## 第一次获取项目

### 常用操作：在仓库根目录执行

| 你要做什么 | 命令 |
| --- | --- |
| 首次安装开发依赖 | `npm run setup` |
| 启动客服后台和本地数据库代理 | `npm run dev` |
| 启动司机小程序（测试模式） | `npm run dev:miniapp` |
| 提交前运行检查与构建 | `npm run check` |

这些统一命令位于最新交接汇总分支；尚未合并到 main 时，请先切换到约定的开发版本。先安装下文要求的 Node.js 和 pnpm。

后台首次启动仍需负责人配置 `webpage/db-proxy/.env` 中的 staging 数据库、服务端密钥和会话配置。脚本不会自动填写密钥，会验证有效环境（含终端覆盖变量），强制本机 4002 端口，等待代理就绪后启动前端。缺配置或端口被占用时会明确报错；Ctrl+C 同时停止两者。AI/OCR 按需配置，普通后台开发不用启动 GPS。

小程序导航、图标和 AuthProvider 检查使用项目已有 TypeScript，不需要 ast-grep。动态路由地址会给出人工核对提醒，不伪装成完全可静态验证。

安装 Git、Node.js 20、pnpm 10.30.3。小程序开发还需微信开发者工具及对应项目权限。

```bash
git clone https://github.com/xingyuanma123-source/mashangguoji-admin.git
cd mashangguoji-admin
```

先阅读根目录 `AGENTS.md`、`CONTRIBUTING.md` 和本文件。平时以 `main` 为开发基线。整理期间，本指南和全部近期改动还在 `codex/collaboration-complete` 分支，可先查看：

```bash
git fetch origin
git switch --track origin/codex/collaboration-complete
```

该分支是供交接和验证的汇总版本，包含未完工的工资代码，不等于已审核发布版本。要接着做某个模块，先与负责人确定使用哪个分支；不要把整条汇总分支直接合进 main。

## 运行与测试

后台：

```bash
cd webpage
npm ci
npm run dev:staging
```

在 `webpage/` 目录单独运行前端时，数据库、AI、OCR 请求分别转发到本机 4002、4003、4004，代理需另行启动。推荐使用上面的根目录 `npm run dev` 自动启动数据库代理和前端。默认 Vite 配置与兼容入口均已改为本机测试端口；不会自动将请求转发到正式 OCR 地址。

代理配置参考各服务 `.env.example`，由负责人通过安全渠道安排测试配置；高权限密钥不能放进前端、Git 或 PR。测试账号不写进公开文档。

```bash
# 在 webpage 目录
npm run lint
npm test
npm run build
npm test --prefix db-proxy
npm test --prefix agent-proxy
# 包含 JT808 修复的分支还运行：
npm test --prefix jt808-server
```

小程序（在仓库根目录开始）：

```bash
cd miniapp
pnpm install --frozen-lockfile
pnpm dev:staging
# 提交前
pnpm lint
pnpm build:staging
```

微信开发者工具导入项目，使用项目负责人安排的 AppID/权限。不要用 production 模式测试数据。

## 每次开发

1. 先商量任务和主要修改文件。每人一个功能分支，避免两人同时修改同一模块；公共接口、数据字段变更先沟通。
2. 确保 `git status` 干净后，从最新 main 建分支（若接手 WIP，改用双方约定的 WIP 分支为起点）：

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/你的名字-功能名称
```

3. 实现功能，运行对应检查，并在 staging 测试。每次提交尽量只包含一个清楚的改动。
4. 检查并提交指定文件：

```bash
git status
git diff
git add 路径1 路径2
git diff --cached
git commit -m "feat: 功能说明"
git push -u origin feat/你的名字-功能名称
```

5. 在 GitHub 创建 Pull Request，通常 base 选 `main`。写清修改内容、测试结果、截图，以及是否涉及 migration。没做完选 Draft。
6. 请另一位协作者 review。CI 全通过且审批通过后才合并；新增代码后重新检查/审批。main 禁止强推和删除，管理员也遵守规则。
7. 合并通常选 Squash and merge。双方开始下一项任务前更新 main。合并源码不等于上线，部署由负责人按上线手册另外安排。

## 同时修改发生冲突

先提交保存自己分支的工作，再把最新 main 合入自己的分支：

```bash
git fetch origin
git merge origin/main
```

如果出现冲突，打开文件，对比 `<<<<<<<`、`=======`、`>>>>>>>` 之间的双方修改，沟通后写出正确的最终代码并删除标记。不要盲目选择全部保留“我的”或“对方的”。

```bash
git add 已解决的文件路径
git commit -m "fix: 合并最新 main 并解决冲突"
# 重新运行检查和功能测试后
git push
```

尚未完成本次 merge 时可用 `git merge --abort` 返回合并前状态。不要使用 force push 覆盖别人提交。即使 Git 自动合并成功，也可能存在业务逻辑冲突，所以双方仍需 review 和测试。

## 数据库和未完成功能

- 开发只使用 staging：`ovtnnahdqljqqkponvhu`；prod 是 `rwjbladqwubgjotlygyy`，不作为测试库。
- 修改结构前阅读 `docs/migrations-ledger.md`，新建 migration，先在 staging 验证。服务器/数据库操作先与负责人确认。
- 工资与派遣均有 WIP 代码；台账中对应 migration 在 prod 尚未应用。不要因看到 SQL 文件就执行导入脚本或迁移。
- `.env`、私钥、数据库导出、客户真实数据、依赖目录和构建输出不提交。公开级 URL/anon 配置不等于服务端管理密钥。

## 本次拆分分支

| 分支 | 内容 | PR 应选择的 base |
| --- | --- | --- |
| `codex/ci-collaboration` | 公共 CI 和本地构建修复 | `main` |
| `codex/review-packaging` | README 与开源说明 | `codex/ci-collaboration` |
| `codex/review-legal-ai` | 法律 AI 配置调整 | `codex/ci-collaboration` |
| `codex/review-jt808` | JT808 环境配置修复 | `codex/ci-collaboration` |
| `codex/review-staging-docs` | 测试服务文档和配置 | `codex/review-packaging` |
| `codex/review-planning` | 规划与审计文档 | `codex/ci-collaboration` |
| `codex/review-payroll` | 工资模块 WIP | `codex/ci-collaboration` |
| `feature/dispatch-management` | 已有派遣 WIP，旧基线 | `main`，合并前先同步并验证 |
| `codex/review-onboarding` | 本协作流程及 staging 开发入口 | `codex/ci-collaboration` |

这些 PR 按依赖审查；前置 PR 合入 main 后，将依赖 PR 的 base 改为 main，并同步 main、重新跑 CI。保留原来的分支，避免丢失旧工作。工资/派遣未验收前保持 Draft。

PR 入口：[CI #15](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/15)、[开源说明 #16](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/16)、[法律 AI #17](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/17)、[JT808 #18](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/18)、[staging 配置 #19](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/19)、[规划文档 #20](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/20)、[协作流程 #21](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/21)、[工资草稿 #22](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/22)、[派遣草稿 #23](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/23)。

建议首先 review #15，再按依赖 review 其余 PR。只有代码作者之外的协作者才能为其提供有效审批；不要为了赶进度关闭 main 的保护规则。
