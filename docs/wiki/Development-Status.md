# 开发进展与下一阶段

更新日期：2026-10-17。

## 已实现的基础

| 模块 | 当前能力 |
| --- | --- |
| 契约 | workspace、work item、事件、GitSnapshot、artifact、ContextPack 的 0.1 JSON 契约 |
| 存储 | 本地 SQLite、事务、迁移、幂等写入、跨实体归属校验 |
| 记忆 | 显式记录和更正、本地关键词检索、从 canonical 事件重建派生索引 |
| 上下文编译 | 确定性选择、估算 token 预算、来源引用、Markdown 证据边界 |
| Git | 仓库定位、版本与变更文件列表、敏感路径过滤 |
| 接入 | CLI、八个 MCP stdio 工具、客户端配置说明生成 |

项目仍处于预发布阶段。当前 Git 指纹未包含文件内容，不能完整识别同一未提交文件继续修改；现有跨客户端配置说明也不等于已完成全部真实客户端验收。

## 本轮维护结果（2026-10-17）

- 发布审定后的 v3 实施方案，并建立 Wiki 导航、接入指南和开发状态页面。
- 整合 [GitHub PR #15](https://github.com/vsvcode-ai/ContextWeft/pull/15) 的 MCP server 2.3.1、[PR #16](https://github.com/vsvcode-ai/ContextWeft/pull/16) 的 Zod 4.6.6，以及 [PR #17](https://github.com/vsvcode-ai/ContextWeft/pull/17) 的工具链更新。
- 修复整合锁文件和 Biome 配置版本，并通过兼容依赖覆盖修复生产依赖安全审计中的高危、严重及可修复的中危问题。
- 本地 `pnpm check` 通过：115 项功能测试、10 项性能测试、构建、stdio 工作流和独立打包安装验证均通过；分支覆盖率为 100%。
- 生产安全审计仅余一项已有记录的低危例外，详见[依赖安全说明](https://github.com/vsvcode-ai/ContextWeft/blob/main/docs/security/dependency-exceptions.md)。远程验证结果见[GitHub Actions](https://github.com/vsvcode-ai/ContextWeft/actions)。

## 已审定的实施方案

[无界面交接方案 v3](https://github.com/vsvcode-ai/ContextWeft/wiki/Headless-Handoff-Design)已合入 9 项复核结论，对应 23 项自动化验收和真实 Agent 交接验收。以下 PR 是计划的交付批次，不是已创建的 GitHub PR 编号：

| 批次 | 交付内容 | 主要验收 |
| --- | --- | --- |
| 1 | 0.1 / 0.2 分版本读取、顺序触发器、迁移及会话契约 | 旧数据保留，旧连接追加和并发迁移行为明确 |
| 2 | Git 内容指纹、覆盖策略与采集完整性 | 同一 dirty 文件继续变化能被检测，无法比较时返回 unknown |
| 3 | 任务选择、版本校验、会话绑定、原子交接与固定快照 | 旧上下文不覆盖新状态，关键内容不会因预算而静默丢失 |
| 4 | handoff / resume / inspect 等 CLI 与 MCP 接口 | 固定项目根、真实输出预算、只读恢复 |
| 5 | Agent 指令模板、setup、doctor、包资源 | 两个真实 Agent 通过自然语言完成交接 |

首阶段面向同一机器、同一个 Git 工作目录。生命周期 hook、长期记忆整理、跨 worktree / 跨机器同步按后续阶段推进。

## 交付标准

Agent A 保存一项包含目标、约束、进展、失败尝试、测试依据与下一步的任务；Agent B 在新会话中恢复并继续，不需要用户粘贴历史聊天。存在多个任务时明确选择，代码变化时提示重新验证。自动化通过但真实客户端未运行的部分保留为“客户端验收待完成”。

当前新增交接能力的状态为待实现，文档发布与依赖升级不代表上述功能已交付。

## 开发与发布资料

- [版本化实施方案及验收清单](https://github.com/vsvcode-ai/ContextWeft/blob/main/docs/headless-handoff-design.zh-CN.md)
- [Alpha 发布和验收步骤](https://github.com/vsvcode-ai/ContextWeft/blob/main/docs/releasing.md)
- [依赖例外说明](https://github.com/vsvcode-ai/ContextWeft/blob/main/docs/security/dependency-exceptions.md)
- [CI 工作流](https://github.com/vsvcode-ai/ContextWeft/blob/main/.github/workflows/ci.yml)
