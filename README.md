# 马上国际物流管理系统

司机在微信小程序里报账，客服在电脑后台管理报账、车辆、司机和备用金。这是我们共同开发的物流管理项目。

**第一次来？先打开 [新手指南：从这里开始](docs/START-HERE.md)。不需要先学会所有 Git 命令，也不用逐个研究分支。**

## 你想做什么？

| 你的目的 | 点这里 |
| --- | --- |
| 看这次整理的最新源码 | [最新源码汇总](https://github.com/xingyuanma123-source/mashangguoji-admin/tree/codex/collaboration-complete) |
| 搞清楚分支、PR、staging 是什么 | [新手指南](docs/START-HERE.md) |
| 找启动说明、服务说明和历史资料 | [文档导航](docs/README.md) |
| 把项目跑起来、一起改代码 | [协作者操作流程](https://github.com/xingyuanma123-source/mashangguoji-admin/blob/codex/collaboration-complete/docs/collaboration-guide.md) |
| 看待审核的改动 | [开发任务 / Pull requests](https://github.com/xingyuanma123-source/mashangguoji-admin/pulls) |

## 先认识两个入口

- **`main`：共同主线。** 放审核合并后的代码，不代表正式服务器已经部署了同一版本。
- **`codex/collaboration-complete`：当前交接汇总。** 包含近期代码和协作说明，适合先浏览。含工资未完工代码，尚未整体验收；派遣另外保存在 [派遣草稿 #23](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/23)。

其他 `review-*` 是分项审核用的临时分支，不是每个人都要维护一份。以后采用 **一个 main + 每项正在做的任务一个分支**，合并后清理任务分支。

## 文件夹是做什么的？

```text
.
├── webpage/     # 电脑上的客服后台，以及 API 代理服务
├── miniapp/     # 司机使用的微信小程序
├── supabase/    # 数据库结构变更；修改前先与负责人确认
├── docs/        # 新手指南、业务说明、测试和上线手册
└── AGENTS.md    # 项目业务规则和操作纪律
```

## 当前功能

仓库包含报账、司机、车辆、备用金及法律/OCR 相关代码。**工资与派遣仍是开发中功能**，见 [工资 #22](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/22) 和 [派遣 #23](https://github.com/xingyuanma123-source/mashangguoji-admin/pull/23)。自动检查通过不等于功能已完成。

## 一起开发，只记住这几步

1. 先商量谁改哪个功能。
2. 从约定的基线新建自己的任务分支，修改并测试。
3. 上传分支，创建 PR（请另一人检查改动的申请）。
4. 另一人审核、自动检查通过，再合入 main。

测试使用 **staging 测试环境**；正式数据在 **prod 正式环境**。后台通过代理连接数据库，运行前必须确认代理也连着测试库。账号和配置由负责人安排。

安装、启动和处理冲突的命令统一看 [协作者操作流程](https://github.com/xingyuanma123-source/mashangguoji-admin/blob/codex/collaboration-complete/docs/collaboration-guide.md)。不要上传实际密钥、客户数据或完整本地 ZIP。

<details>
<summary>开发者参考：技术栈与进一步阅读</summary>

- 后台：React、TypeScript、Vite；小程序：Taro、React。
- 数据：Supabase；检查：Biome、tsgo、Vitest。
- [代码协作约定](CONTRIBUTING.md) · [项目业务与操作纪律](AGENTS.md)。

- MIT 许可证见 [LICENSE](LICENSE)。

</details>
