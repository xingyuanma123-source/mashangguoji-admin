# 后台服务分别做什么？

[返回文档导航](README.md)

页面发出请求，代理服务再访问数据库或外部服务。司机小程序的数据访问另走自己的客户端配置，不通过后台的 db-proxy。

| 服务目录 | 用途 | 什么时候需要 | 本地测试约定 |
| --- | --- | --- | --- |
| `webpage/db-proxy/` | 后台登录会话、数据库访问与权限检查 | 后台登录和业务数据操作 | 本机 4002，连接 staging 库 |
| `webpage/agent-proxy/` | 法律 AI 对话和工具处理 | 调试法律 AI 功能 | 本机 4003，连接 staging 库 |
| `webpage/ocr-proxy/` | 图片/PDF 识别请求转发 | 调试 OCR 功能 | 本机 4004；外部服务凭证由负责人安排 |
| `webpage/jt808-server/` | 接收 GPS 终端 TCP 数据并写位置记录 | 调试定位设备接入 | 独立 TCP 服务，代码默认 8808；先确认端口和数据库 |

以上 4002/4003/4004 是前端开发代理目标，不是各服务不配置时的默认端口。推荐从仓库根目录运行 `npm run dev`，它校验 staging 配置并自动启动数据库代理（固定本机 4002）和前端。AI/OCR 若手动启动，仍须设置对应 PORT。OCR 不是通过“切换 Supabase 库”来切换供应商环境，测试可能仍会调用付费识别接口。

## 本地启动的前提

负责人先明确目标环境、服务配置和端口，再按各服务的 `.env.example` 安排本地配置。密钥由负责人填写或安全提供，不在前端或仓库中保存。高权限数据库 key 仅供服务端使用。

db-proxy、agent-proxy、ocr-proxy 在各自目录内使用 `npm ci`、`npm start`；服务从当前目录加载 `.env`，不要误以为只启动前端就会自动启动所有代理。JT808 作为独立设备服务，按负责人确认的方案处理，不随普通页面开发自动启动。

后台测试代理连接 staging：`ovtnnahdqljqqkponvhu`。prod：`rwjbladqwubgjotlygyy`，不是本地测试目标。进程成功启动只能证明进程在运行，不能证明配置了正确的数据库。

## 常见疑问

- 页面能打开，但登录失败：先检查 db-proxy 是否运行、端口是否为 4002、测试账号与环境是否匹配。
- 普通后台页面正常，AI/OCR 不可用：检查对应服务和配置；不必重建数据库。
- 只改普通前端页面：通常不需要启动 GPS 服务，也不需要部署线上服务。

后台安装和测试命令见 [后台 README](../webpage/README.md)，整体步骤见 [协作流程](https://github.com/xingyuanma123-source/mashangguoji-admin/blob/codex/collaboration-complete/docs/collaboration-guide.md)。服务器部署、数据库迁移、数据导入属于独立操作，遵循仓库确认流程和对应手册。
