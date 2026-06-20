<!-- 标题请用 Conventional Commits 格式，例：feat(legal): 新增合同抽取 -->

## 变更类型
<!-- 勾选适用项 -->
- [ ] feat 新功能
- [ ] fix 修复
- [ ] refactor 重构（不改变外部行为）
- [ ] chore 杂项 / 构建 / 依赖
- [ ] docs 文档

## 说明
<!-- 这个 PR 做了什么、为什么 -->

## 影响范围
- [ ] webpage（网站）
- [ ] miniapp（小程序）
- [ ] supabase（数据库 / 边缘函数）
- [ ] 部署脚本 / CI

## 数据库 / 部署
- [ ] 不涉及数据库变更
- [ ] 含 migration —— 已说明是否需手动 apply、apply 到哪个环境
- [ ] 合并到 main 会触发自动部署，已确认可发布

## 自测清单
- [ ] 本地构建通过（`pnpm build`）
- [ ] 相关单测通过（`pnpm test`）
- [ ] 手动验证过主要路径

## 安全确认
- [ ] 无 `.env` / 密钥 / token 进入提交
- [ ] 无 `node_modules` / 构建产物进入提交

## 关联
<!-- Closes #xx / 关联 issue 或 PR -->
