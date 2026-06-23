# AGENTS.md

本文件是本仓库给 AI 助手（Codex、Claude Code 等）的长期工作纪律。除非用户明确覆盖，处理本仓库任务时必须遵守。

## 数据库纪律

- 数据库改动一律先写成 migration 文件，不在库里手动建表/改字段。
- 表结构变更顺序：先应用到 staging 库（ovtnnahdqljqqkponvhu）验证，确认没问题后再应用到 prod 库。绝不直接改 prod 库结构。
- prod 库的结构永远来自“已在 staging 验证过的 migration”。
- staging 和 prod 保持表结构一致，但数据各自独立——staging 是测试数据，prod 是真实数据，互不同步。

## 环境隔离纪律

- prod（正式）和 staging（测试）是两条独立轨道，从代码到数据库都分开。
- 本地开发默认连 staging 库测试，乱填数据只进 staging，不污染 prod。
- 任何碰服务器/数据库的操作，必须分清是 prod 还是 staging，操作前确认 project ref / IP / 端口，别误碰 prod。
- prod 库 ref：rwjbladqwubgjotlygyy；staging 库 ref：ovtnnahdqljqqkponvhu。

## 密钥处理纪律

- service_role key 等敏感密钥，默认由我本人填写，AI 不主动写入（除非我明确授权）。
- 含密钥的 .env 文件必须在 .gitignore 里，绝不提交进 git。

## 开发流程纪律

- 改动走 PR 流程，不直接 push main。CI（build+lint+test）是 main 的门禁，所有 PR 必须 CI 通过才能合并。
- 数据库或功能改动的验证顺序：先在本地连 staging 库测试 → 通过 → 再上 prod。prod 只接收已在 staging 验证过的版本。
- 涉及服务器、数据库、CI 的操作，先出计划/方案让用户确认，再动手；用户习惯“先看计划再执行”。碰 prod 的操作尤其要先停下来确认。
