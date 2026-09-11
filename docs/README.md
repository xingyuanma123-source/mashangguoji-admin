# 文档导航

文档分成“现在照着做”“理解设计”“查历史”三类。历史记录中的完成勾选、账号数量、环境地址和命令不能作为当前验收结论或操作指令。

## 现在照着做

| 你需要什么 | 阅读入口 |
| --- | --- |
| 第一次看仓库 | [新手指南](START-HERE.md) |
| 下载、开发、提交 PR、解决冲突 | [协作流程](https://github.com/xingyuanma123-source/mashangguoji-admin/blob/codex/collaboration-complete/docs/collaboration-guide.md) |
| 理解各代理和 GPS 服务 | [服务说明](SERVICES.md) |
| 启动客服后台 | [后台 README](../webpage/README.md) |
| 启动司机小程序 | [小程序快速开始](../miniapp/QUICK_START.md) |
| 小程序连哪个环境 | [数据库配置](../miniapp/DATABASE_CONFIG.md) |
| 业务与操作纪律 | [AGENTS.md](../AGENTS.md) |
| 数据库迁移应用状态 | [migration 台账](migrations-ledger.md)，唯一状态来源 |
| 测试服务操作 | [staging 手册](staging-server-setup.md)，操作前确认 |
| 正式上线 | [prod 手册](prod-release-runbook.md)，操作前确认 |

## 理解业务与设计

- [后台需求](../webpage/docs/prd.md)、[司机端需求](../miniapp/docs/prd.md)、[车辆管理](../webpage/docs/vehicles-management.md)。
- [法律系统设计](../webpage/docs/legal-system-design.md)、[法律 AI 设计](../webpage/docs/legal-agent-design.md)。
- [工资模块规格](https://github.com/xingyuanma123-source/mashangguoji-admin/blob/codex/collaboration-complete/docs/报账工资模块-spec.md)、[工资需求暂存](https://github.com/xingyuanma123-source/mashangguoji-admin/blob/codex/collaboration-complete/docs/报账工资需求暂存-2026-09-06.md)、[派遣状态与计划](https://github.com/xingyuanma123-source/mashangguoji-admin/blob/codex/collaboration-complete/docs/dispatch-status-and-plan.md)。

这些文件帮助理解意图；是否实现、是否验收、是否部署，须分别核对代码、PR 和环境记录。

## 查历史与阶段记录

- 本次交接的阶段记录：[collaboration-readiness](https://github.com/xingyuanma123-source/mashangguoji-admin/blob/codex/collaboration-complete/docs/collaboration-readiness.md)。
- 审计/盘点：[安全审计](https://github.com/xingyuanma123-source/mashangguoji-admin/blob/codex/collaboration-complete/docs/security-audit-2026-07-10.md)、[腾讯云迁移盘点](https://github.com/xingyuanma123-source/mashangguoji-admin/blob/codex/collaboration-complete/docs/tencent-cloud-migration-inventory.md)、[性能报告](../webpage/docs/PERF_OPTIMIZATION_REPORT.md)。
- 小程序早期记录：[项目状态](../miniapp/PROJECT_STATUS.md)、[旧任务表](../miniapp/TODO.md)、[旧交付清单](../miniapp/CHECKLIST.md)、[旧切库总结](../miniapp/DEPLOYMENT_SUMMARY.md)、[旧数据库指南](../miniapp/DATABASE_GUIDE.md)。
- 后台早期记录：[旧任务表](../webpage/TODO.md)。

历史文件保留原路径，兼容已有链接；顶部会标明历史属性。不要根据旧文档的“已完成”推断现在能直接上线。

## 以后怎么维护

操作步骤只维护一个入口，其他文件用链接引用。新报告写明日期与范围；已过期内容加历史提示。修订配置说明时，以当前代码及仓库纪律为准，不复制真实账号、密钥或客户数据。
