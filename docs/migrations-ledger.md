# 数据库 Migration 台账

> 规则:数据库结构改动一律写成 migration,先 apply staging 验证、再 apply prod。
> 绝不手动在库里改表。本表是 prod/staging 应用状态的唯一事实来源。

## 环境
- prod:    rwjbladqwubgjotlygyy(腾讯云 119.91.129.106)
- staging: ovtnnahdqljqqkponvhu

## 应用状态

| version | 文件 | staging | prod | 说明 |
|---|---|:--:|:--:|---|
| 20260621171750 | baseline.sql | ✅ | ✅ | 基线(29 表 / 3 视图)。prod 实际由 21 条旧粒度 history 压平而来,表名一致、history 记录不同,属历史遗留,不处理。 |
| 20260623165844 | dispatch_management.sql | ✅ | ❌ | 派遣模块结构。从 staging history 找回(md5 校验一致),纯结构无数据操作;vehicles_sorted 视图经核对仅在末尾增 type_seq/operator 两列,不影响 prod 现有列。**上线派遣前必须 apply 到 prod。** |

## 标准操作(SOP)
新增数据库改动时,严格按以下顺序:
1. 写 migration 文件 → supabase/migrations/`<时间戳>_<描述>.sql`(时间戳格式 YYYYMMDDHHMMSS)
2. apply 到 staging:`supabase db push`(指向 staging)
3. 本地连 staging 测功能,确认无误
4. apply 到 prod:`supabase db push`(指向 prod)
5. 回来更新本表对应行的 prod 状态 ✅,git commit

## 纪律
- 任何 migration 必须先 staging 验证、后 prod,中间不跳步。
- 绝不手动在任一库里改表/改字段——一切走 migration 文件。
- 本表与远端 `supabase_migrations.schema_migrations` 应保持一致;不一致时以排查后的事实更新本表。
