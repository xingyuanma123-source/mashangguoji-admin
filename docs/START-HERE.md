# 第一次来，从这里开始

[返回项目首页](../README.md)

要找具体说明，打开 [文档导航](README.md)；不确定要启动哪个代理，先看 [服务用途](SERVICES.md)。

## 1. 我应该看哪份代码？

先点 [最新源码汇总](https://github.com/xingyuanma123-source/mashangguoji-admin/tree/codex/collaboration-complete)。这是此次交接的查看入口，文件夹可以直接点击打开，不需要先下载。

GitHub **Code 页面左上角**的分支选择框表示“当前在看哪个版本”。换分支只是切换查看版本，不会修改代码。看司机端就打开 `miniapp/src/`，看客服后台就打开 `webpage/src/`。

汇总入口含工资未完工代码，不包含旧派遣分支的全部功能；派遣另看 [#23](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/23)。

## 2. 这些词是什么意思？

| 词 | 白话解释 |
| --- | --- |
| 仓库 Repository | 存放项目文件和修改历史的地方 |
| 分支 Branch | 从某个版本分出来的独立修改路线，不是另一套部署 |
| main | 大家审核后共同合并代码的主线 |
| clone | 第一次把代码和历史下载到电脑 |
| commit | 在自己电脑上保存一次有说明的代码版本 |
| push | 把已经 commit 的版本上传到 GitHub |
| PR / Pull Request | 请大家检查并合并一组改动的申请 |
| review / 审核 | 看改动是否合理，提出问题或批准 |
| CI / Checks | 自动运行代码检查、测试和构建 |
| Draft / WIP | 还没做完，可以交流，暂时不要合并 |
| staging | 测试环境，这里的数据库是测试库 |
| prod | 正式环境，里面是真实业务数据 |

**上传到 GitHub、合入 main、部署上线是三件不同的事。** 看到了代码，不说明正式网站已经在使用它。

## 3. 为什么现在有这么多分支？

这次交接把历史改动拆成了多个审核分支。你只需关注自己正在做的任务，不用逐个打开。

| 分组 | 用途 | 现在怎么处理 |
| --- | --- | --- |
| `main` | 共同主线 | 长期保留 |
| `codex/collaboration-complete` | 集中查看近期代码 | 当前先从这里看 |
| `codex/review-*`、`codex/ci-collaboration` | 分项审核 | PR 合并前保留，完成后清理 |
| `feature/dispatch-management` | 旧派遣功能的未完成代码 | 接手派遣的人再看 |
| `codex/collaboration-readiness` | 原工作目录保留的修复记录 | 不是新开发入口 |
| `gh-pages` | 网站发布相关分支 | 日常业务开发不用改 |

已经完整保存在汇总版本中的旧备份，可转存为 `archive/*` 标签并从分支列表移走。标签像给历史版本贴上固定书签，在分支下拉框的 **Tags** 标签页可找回，不用于日常开发。

## 4. 我现在要开始写代码

1. 接受 GitHub 协作者邀请，与负责人确定任务。
2. 按 [完整操作流程](https://github.com/xingyuanma123-source/mashangguoji-admin/blob/codex/collaboration-complete/docs/collaboration-guide.md) 安装工具、clone、配置测试环境。
3. 日常新任务从最新 main 建分支；接手未完成功能时，从负责人指定的功能分支开始。**不要在汇总分支上两人同时开发。**
4. 分支写清人和任务，例如 `feat/xiaoming-payroll-page`，一次完成一个小任务。
5. 测试后提交 PR，请另一人 review。冲突时共同确认最终代码，不要强推覆盖。

安装好前端依赖不等于后端已配置好。后台 `dev:staging` 需要本地测试代理，代理本身必须连接 staging 库。账号和配置找负责人；旧的默认开发配置含正式 OCR 目标，请按完整流程使用测试启动入口。

## 5. 现有 PR 应该怎么看？

不需要一次看完。先看与你任务相关的说明。开始合并审查时，先处理 [基础检查修复 #15](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/15)。

| PR | 内容 |
| --- | --- |
| [#15](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/15) | 公共自动检查修复，其他审核分支的前置 |
| [#16](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/16) | 中文首页、新手指南、开源说明 |
| [#17](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/17) | 法律 AI 配置 |
| [#18](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/18) | JT808 配置 |
| [#19](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/19) | staging 配置说明，依赖 #16 |
| [#20](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/20) | 规划和审计说明 |
| [#21](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/21) | 协作流程和测试启动入口 |
| [#22](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/22) | 工资草稿，待完成 |
| [#23](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/23) | 派遣草稿，待完成 |

审核分支目前有前后依赖。前置 PR 合入 main 后，由负责人把后续 PR 的 base 改为 main，再同步、检查和合并。不要把任务随手合入临时审核分支。最新状态以 PR 页面为准。

## 6. 不知道下一步时

把“在哪个分支、做了什么、完整报错”发给负责人。截图可以帮助定位界面问题，但不要包含密钥。具体命令和冲突处理都在 [完整操作流程](https://github.com/xingyuanma123-source/mashangguoji-admin/blob/codex/collaboration-complete/docs/collaboration-guide.md) 中。
