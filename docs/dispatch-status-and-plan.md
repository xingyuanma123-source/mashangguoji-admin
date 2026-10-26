# 派遣模块现状摸底 + 开发计划

调查日期：2026-06-27

调查分支：`feature/dispatch-management`

调查边界：只读代码和 Git 历史；未查询 staging/prod 数据库，未运行写库操作，未改动前端功能文件。

## 0. 分支和提交历史

- 开工状态：`git status --short --branch` 显示 `## feature/dispatch-management...origin/feature/dispatch-management`，`git status --porcelain=v1` 为空。
- `git log --oneline main..HEAD` 输出两条：`188e556 WIP: 车辆派遣管理模块（开发中，尚未完成）`、`353d841 chore: cleanup 3d frontend deploy docs`。
- `git log --oneline -- webpage/src/features/dispatch/ webpage/src/pages/DispatchBoardPage.tsx` 只命中 `188e556 WIP: 车辆派遣管理模块（开发中，尚未完成）`。

## 1. 数据访问路线判定

结论：`webpage/src/features/dispatch/api.ts` 和成熟对照组 `webpage/src/features/vehicles/api.ts` 当前都走同一个 `@/lib/supabase` client；这个 client 不是直接使用公开 Supabase URL/anon key 的裸直连，而是用 Supabase JS SDK 指向 db-proxy 路径。

事实：

- `dispatch/api.ts` 第 1 行 import `supabase` from `@/lib/supabase`；所有派遣读写都通过这个 client 调 `.from(...)`，包括 `vehicles_sorted`、`dispatch_records`、`customers`、`dispatch_operation_logs`，见 `webpage/src/features/dispatch/api.ts:1`、`:152-156`、`:191-199`、`:209-223`、`:226-251`、`:254-287`、`:290-319`。
- `vehicles/api.ts` 第 1 行同样 import `supabase` from `@/lib/supabase`；车辆成熟模块通过同一 client 访问 `vehicles`、`vehicles_sorted`、`vehicles_trailer`、`truck_trailer_assignments`、`operating_companies` 和 storage，见 `webpage/src/features/vehicles/api.ts:1`、`:98-123`、`:145-183`、`:186-254`、`:261-327`、`:330-399`。
- `webpage/src/lib/supabase.ts` 创建 Supabase client 时，`supabaseUrl` 优先取 `VITE_SUPABASE_PROXY_URL`，否则是当前站点下 `/api/db/supabase`；key 是固定字符串 `proxy-managed-session`，并关闭 Supabase auth token 持久化，见 `webpage/src/lib/supabase.ts:4-17`。
- `webpage/src/lib/proxySession.ts` 的 `fetchWithProxySession` 对所有请求加 `credentials: 'include'`，并在 `/api/db/supabase/` 或 `/api/agent/` 返回 401 时派发登录失效事件，见 `webpage/src/lib/proxySession.ts:3-8`、`:22-28`。
- 仓库内检索显示现有前端模块默认也在用 `@/lib/supabase`：`webpage/src/db/api.ts`、`webpage/src/components/expenses/EditExpenseDialog.tsx`、`webpage/src/pages/VehicleTracking.tsx`、`webpage/src/features/vehicles/api.ts`、`webpage/src/features/dispatch/api.ts` 都 import 这个 client；`webpage/src/db/supabase.ts` 只是 re-export `@/lib/supabase`。

判定：

- 派遣模块当前与车辆模块的数据访问路线一致，都是“Supabase SDK 语法 + db-proxy URL + cookie session fetch”，不是新增一条直连浏览器到 Supabase 的路线。
- `proxySession.ts` 是代理会话 fetch 包装层，负责携带 cookie 和处理代理登录失效；`supabase.ts` 是项目当前统一 Supabase client，封装了 db-proxy 地址和 `fetchWithProxySession`。
- 后续派遣模块数据层建议继续走 db-proxy，不要改回直连。理由是 RLS 锁定铁律应是“先迁 proxy -> 确认所有浏览器数据访问都稳定走代理 -> 再锁 RLS”；当前派遣和车辆已经同路由，继续沿用能减少 RLS 上锁前后的差异。直连会重新暴露浏览器侧 URL/key、权限和 RLS 策略耦合问题，不适合作为最终路线。

## 2. 前端完成度盘点

- DispatchBoardPage 渲染：半截。组件、查询、状态、表格和弹窗代码完整，`DispatchBoardPage` 定义在 `webpage/src/pages/DispatchBoardPage.tsx:93-559`，页面包在 `MainLayout` 内，见 `:247-555`；但本次未运行 dev/build/browser，只能判定源码层已接好，不能判定运行态已通过。
- 看板布局形态：完成。页面是“车辆行 x 月内日期列”的横向表格，左侧 sticky 车辆列，日期列来自 `board.days`，单元格点击新增或查看明细，见 `webpage/src/pages/DispatchBoardPage.tsx:341-439`；顶部有在册车辆、本月闲置数、本月派车总次数，见 `:262-280`。
- 查询：完成到数据层。`getDispatchBoardData` 先按筛选查 `vehicles_sorted`，再按月份、车辆 id 和 `is_deleted=false` 查 `dispatch_records`，见 `webpage/src/features/dispatch/api.ts:166-207`；页面用 React Query 调它，见 `webpage/src/pages/DispatchBoardPage.tsx:109-112`。
- 建派遣记录：半截。数据层 `createDispatchRecord` 已写 `dispatch_records` 并带 `vehicle_id`、`dispatch_date`、`customer_id`、`agent_id`、`is_substitute_driver`，见 `webpage/src/features/dispatch/api.ts:226-251`；页面空单元格打开新增弹窗并调用 mutation，见 `webpage/src/pages/DispatchBoardPage.tsx:142-158`、`:216-237`、`:495-552`。未做运行验证。
- 改派遣记录：半截。数据层更新 `customer_id` 和 `is_substitute_driver`，非 admin 加 `agent_id=user.id` 约束，见 `webpage/src/features/dispatch/api.ts:254-287`；页面在明细弹窗中提供修改按钮，见 `webpage/src/pages/DispatchBoardPage.tsx:160-177`、`:466-475`。未做运行验证。
- 软删：半截。数据层把 `is_deleted` 更新为 true，非 admin 加 `agent_id=user.id` 约束，见 `webpage/src/features/dispatch/api.ts:290-319`；页面有删除按钮和确认弹窗，见 `webpage/src/pages/DispatchBoardPage.tsx:179-190`、`:239-241`、`:476-484`。未做运行验证。
- 客户自动沉淀：完成到数据层。`findOrCreateDispatchCustomer` 先按 `name` 查 `customers`，不存在则 insert `name`、`created_by`，insert 失败后再查一次处理并发唯一约束竞争，见 `webpage/src/features/dispatch/api.ts:119-150`。严格说这是 select-then-insert 的 find/create，不是数据库级 upsert。
- 车头/车挂分配 UI：缺于派遣页面。`DispatchBoardPage` 只显示车头车辆字段和派遣记录，没有车挂分配交互；车辆成熟模块已有 `getTruckTrailerAssignments`、`getAvailableTrailers`、`assignTrailerToTruck`，见 `webpage/src/features/vehicles/api.ts:330-399`，且这些函数被 `webpage/src/features/vehicles/components.tsx` 使用，但派遣页面没有接入。
- 操作日志写入：半截。派遣 create/update/delete 成功后分别插入 `dispatch_operation_logs`，见 `webpage/src/features/dispatch/api.ts:111-117`、`:245-250`、`:278-286`、`:310-318`；但没有日志查看 UI，也没有和主写入放在同一个事务里。
- 路由注册：完成。`DispatchBoardPage` lazy import 在 `webpage/src/routes.tsx:18`，`/dispatch` route 在 `webpage/src/routes.tsx:71-74`。
- 菜单挂载：完成。旧 `Navbar.tsx` navItems 有 `/dispatch`，见 `webpage/src/components/layouts/Navbar.tsx:34-42`；当前 `DispatchBoardPage` 实际使用的 `MainLayout` fleet 分组也挂了 `/dispatch`，见 `webpage/src/pages/DispatchBoardPage.tsx:5`、`webpage/src/components/layouts/MainLayout.tsx:79-86`。
- `logic.ts` 业务规则覆盖：完成到纯逻辑层。覆盖月份天数、按 active 车辆过滤、软删过滤、按车/日期聚合、同日多条显示 `客户 +N`、统计活跃车数/未派车数/记录数、日派车计数、距上次派车天数、闲置判定、固定顺序和闲置排序，见 `webpage/src/features/dispatch/logic.ts:111-239`。
- `logic.test.ts` 测试覆盖：半截。已测 2026-06 月历、行单元格、顶部统计、闲置状态、同日多条 label、固定排序和闲置排序，见 `webpage/src/features/dispatch/logic.test.ts:82-140`；未测数据层、权限、页面交互、代理会话、错误状态。

## 3. 缺口清单

### 对照 DB schema 的功能缺口

- `dispatch_records`：基础字段已覆盖读写，但没有明确重复记录策略。当前逻辑允许同一车同一天多条记录，并显示 `客户 +N`，见 `webpage/src/features/dispatch/logic.ts:160-167`；是否允许同车同日多客户/多派遣需要业务确认。
- `dispatch_records.agent_id`：创建时写当前客服，更新时不改 `agent_id`，符合“录入客服后续修改不变”，见 `webpage/src/features/dispatch/api.ts:233-239`、`:260-265`。缺口是非本人修改/删除失败时只会透出 Supabase `.single()` 错误，UI 没有友好权限提示，见 `webpage/src/features/dispatch/api.ts:268-274`、`:300-306`。
- `dispatch_operation_logs`：有写入，无读取、筛选、展示、导出；写日志失败会让前端 mutation 报错，但主记录 mutation 已经成功，存在“业务已变更但 UI 认为失败”的非原子风险，见 `webpage/src/features/dispatch/api.ts:245-250`、`:278-286`、`:310-318`。
- `customers`：能按 name 沉淀，缺少前端输入搜索联动。页面打开表单时只拉一次 `getDispatchCustomers()`，见 `webpage/src/pages/DispatchBoardPage.tsx:114-118`；数据层虽然支持 search 参数，见 `webpage/src/features/dispatch/api.ts:209-219`，但 UI 没传搜索词，datalist 最多显示 100 条，见 `webpage/src/pages/DispatchBoardPage.tsx:523-535`。
- `vehicles.type_seq` / `vehicles.operator`：看板读取并展示，见 `webpage/src/features/dispatch/api.ts:12-22`、`webpage/src/pages/DispatchBoardPage.tsx:70-76`、`:381-392`；缺口是派遣模块没有维护这些派遣专用字段的入口。
- `vehicles_trailer` + `truck_trailer_assignments`：派遣模块未使用。车辆模块有车挂分配数据层和组件使用，见 `webpage/src/features/vehicles/api.ts:330-399`；派遣看板没有展示当前车挂、没有按车挂过滤、没有分配操作。
- `operating_companies`：派遣模块只通过 `vehicles_sorted.operating_company_short_name` 做 operator fallback 显示，见 `webpage/src/features/dispatch/api.ts:20`、`webpage/src/pages/DispatchBoardPage.tsx:70-76`；没有营运公司筛选或显式字典读取。

### 代码标记和明显风险点

- 显式 `TODO/FIXME/WIP/HACK`：在本次指定派遣/车辆/路由/菜单/client 文件范围内未命中。
- 类型风险：`recordAsRelation` 把 `DispatchBoardRecord` 强转为 `DispatchRecordWithRelations`，见 `webpage/src/pages/DispatchBoardPage.tsx:66-68`。当前字段结构相近，但后续如果 relation 类型扩展，编译器不会保护这里。
- 运行验证缺口：本次按只读要求没有跑 build/test/browser，所以“能渲染”只基于源码接线判断。
- UI 体验缺口：新增/修改/删除使用浏览器原生 `window.confirm`，见 `webpage/src/pages/DispatchBoardPage.tsx:224-241`；这可用但和现有 shadcn Dialog 风格不一致。
- 统计口径待确认：顶部“本月闲置数”实际是 `neverDispatchedCount`，即本月完全没有派遣记录的车辆数，见 `webpage/src/features/dispatch/logic.ts:198-201`；同时行级 `isIdle` 会把超过阈值的车辆也标黄，见 `webpage/src/features/dispatch/logic.ts:177-180`。名称和口径需要业务确认。
- “各时段用车时间分布”当前是每日派遣记录数，没有时段维度，见 `webpage/src/pages/DispatchBoardPage.tsx:424-436`。如果业务要按上午/下午/晚间或小时分布，schema 和 UI 都未覆盖。

## 4. 建议的开发计划

总建议：派遣模块最终继续走 db-proxy 路线，沿用 `@/lib/supabase`。不要引入直连 Supabase client。RLS/权限上线顺序按“先迁 proxy -> 确认 -> 再锁”：先确保派遣所有读写在本地/staging 都稳定通过 `/api/db/supabase` cookie session；确认 db-proxy 对 `dispatch_records`、`customers`、`dispatch_operation_logs`、`vehicles_sorted`、storage/视图读取都覆盖；最后再收紧 Supabase RLS 或撤掉浏览器直连依赖。

1. 锁定业务口径：和业务主确认同车同日是否允许多条派遣、`本月闲置数` 是否等于本月未派车、`闲置阈值` 是否按距上次派车天数、`代驾` 是否只是布尔标记；产出是更新后的字段/交互口径清单，涉及报告和后续 `webpage/src/features/dispatch/logic.ts`。
2. 补纯逻辑测试：先扩充 `webpage/src/features/dispatch/logic.test.ts`，覆盖软删过滤、非本月记录过滤、inactive vehicle 过滤、同车同日多条排序、阈值边界；产出是可保护看板统计口径的测试。
3. 梳理数据层错误和权限反馈：在 `webpage/src/features/dispatch/api.ts` 里把非本人 update/delete 无返回的情况转成明确错误文案，并保留 admin 例外；产出是更稳定的 mutation 错误语义。
4. 决定日志一致性方案：如果操作日志必须强一致，优先规划一个服务端 RPC 或 db-proxy 事务端点，把 dispatch 写入和 `dispatch_operation_logs` 写入合并；如果允许弱一致，则在 UI 文案和重试策略里明确。涉及 `webpage/src/features/dispatch/api.ts` 和可能的 db-proxy/RPC migration，执行前必须另起数据库计划。
5. 完善客户选择体验：在 `DispatchBoardPage.tsx` 把客户输入接到 `getDispatchCustomers(search)`，做 debounce 和空态；产出是大客户列表下仍可搜索复用客户的表单。
6. 补 API/UI 层测试：给 `webpage/src/features/dispatch/api.ts` 增加 mock Supabase 单元测试，给 `DispatchBoardPage.tsx` 增加关键交互测试或至少 smoke 测试；产出是 create/update/delete/query 行为被测试覆盖。
7. 明确车挂是否进入派遣看板：如果业务需要，先只读展示当前车挂，复用车辆模块 `getTruckTrailerAssignments` 的数据口径；不要一开始把分配编辑塞进看板。涉及 `webpage/src/features/dispatch/api.ts`、`logic.ts`、`DispatchBoardPage.tsx`，产出是车头旁显示当前车挂或车挂筛选。
8. 完善营运公司筛选：如果业务需要按营运公司看派遣，复用 `vehicles_sorted.operating_company_short_name` 或车辆模块 `getOperatingCompanies()`；涉及 `dispatch/api.ts` filters、`DispatchBoardPage.tsx` 筛选控件和 `logic.test.ts`。
9. 做代理路线验收：在 staging 环境用普通客服/admin 分别验证 `/dispatch` 的查、增、改、删、客户沉淀、登录过期处理；同时确认浏览器网络请求全部落在 `/api/db/supabase` 而非 Supabase 直连域名。产出是 RLS 上锁前的验收清单。
10. RLS 锁定前复核：确认网页端所有成熟模块与派遣模块都已走 db-proxy，再按 migration SOP 设计 RLS/权限收紧；这一步属于数据库/权限计划，必须单独确认 staging -> prod 顺序，不能混在前端功能 PR 里直接做。

## 5. 风险/待确认

- 同车同日是否允许多客户/多次派遣？当前代码允许并用 `客户 +N` 显示。
- “本月闲置数”业务口径是否是本月从未派车，还是超过闲置阈值的车辆数？
- `代驾` 字段是否只影响展示，还是会影响统计、权限、报表或薪酬？
- 客户唯一规则是否只按完全相同的 `name`，是否需要 trim、大小写、全半角、别名、历史客户合并规则？
- 派遣记录创建后，录入客服 `agent_id` 是否永远不变；admin 修改他人记录时是否仍显示原录入客服？
- 操作日志是否必须和主记录写入强一致；如果必须，需要服务端事务/RPC 设计，不能只靠前端连续两次请求。
- 车挂是否要进入派遣看板首版；如果进入，是只读展示当前挂，还是允许在派遣时调整绑定？
- 看板“各时段用车时间分布”是否真需要时段字段；当前 schema 只有 `dispatch_date`，无法按时段统计。
- 派遣页面是否应该限制 admin/staff 可见范围；当前页面依赖菜单和数据层权限，非 admin 只能改/删自己的记录，但查询看板会看到所有记录。
- RLS 上锁时间点：必须先确认前端和 db-proxy 路线稳定，再收紧数据库策略。
