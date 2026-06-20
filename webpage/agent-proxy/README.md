# agent-proxy — 法务 Agent 服务

OpenAI 兼容 LLM tool-calling 主循环 + SSE 推流 + 写操作审批拦截。设计文档见 `../docs/legal-agent-design.md`。

## 架构

```
前端 AgentConsolePage ──POST /api/agent/runs (SSE)──▶ agent-proxy:3003
                                                        │ 会话校验（与 db-proxy 同一 SESSION_SECRET 的 cookie）
                                                        │ Agent Loop（最多 12 轮 LLM 调用）
                                                        │   只读工具直接执行
                                                        │   写工具 → 挂起 suspended → 用户批准后 /approve 续跑
                                                        ▼
                                              Supabase REST（service_role）
```

## 工具清单

| 工具 | 审批 |
|---|---|
| search_contracts / get_contract / search_knowledge / list_matters / get_matter / compute_deadline / check_evidence / search_cases | 免 |
| link_matter / draft_document（仅存草稿） | 免 |
| create_matter / update_matter / create_task / register_obligation / close_matter | ✅ 用户批准 |
| finalize_document | ✅ 仅 admin |

催收工作流：prompt 内置首次/二次/律师函三级递进口径；文书在 UI 定稿后「标记已发出」写入 `sent_at`，雷达按 7/30 天档位跟进无回应提醒。结案用 `close_matter` 写结案报告，沉淀为 `search_cases` 可检索的案例。

时效计算走 `deadline_rules` 表查表，不由 LLM 心算。
`check_evidence` 返回按事项类型的证据包标准清单（货损/催收/纠纷），供 agent 对照标缺失、派任务。

## 雷达（主动监控）

每日 `RADAR_SCAN_HOUR`（默认 8 点）自动扫描，产出 `legal_tasks(source='radar')`，按标题对未完成待办去重：

| 数据源 | 规则 |
|---|---|
| `contracts_expiring` | 未 ack 的到期/续约通知预警 |
| `obligations`（pending） | 30 天窗口内（含逾期） |
| `matters` 时效 | `statute_deadline` 90 天内，≤30 天标【紧急】 |
| `legal_drafts`（sent） | 发出超 7 天提醒升级口径，超 30 天提示诉讼评估（仅进行中事项） |

手动触发（admin）：`POST /api/agent/radar/scan`。Dashboard 的「法务雷达」卡片展示未完成待办。

## 部署

```bash
cd agent-proxy
npm install
cp .env.example .env   # 填写，SESSION_SECRET 必须与 db-proxy 一致
pm2 start ecosystem.config.js
```

nginx 增加：`location /api/agent/ { proxy_pass http://127.0.0.1:3003; proxy_buffering off; }`
（SSE 必须关 buffering）

## 已知约束

- 模型请求层会对 429/5xx 和网络错误有限重试，认证等 4xx 不重试
- 模型偶发"叙述计划不调工具"，`agent.js` 的 PLAN_ONLY_PATTERN 纠偏一次
- 步数超限时自动降级为"基于已有信息总结收尾"，不会硬失败

## 测试

```bash
npm test   # node --test，纯函数单测
```
