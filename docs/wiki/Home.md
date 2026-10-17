# ContextWeft Wiki

ContextWeft 是无界面的跨 Agent 上下文工具，目标是在现有 Agent 内通过自然语言指令、CLI 或 MCP 保存和恢复任务。

最后更新：2026-10-17。

## 导航

- [无界面交接实现方案 v3](https://github.com/vsvcode-ai/ContextWeft/wiki/Headless-Handoff-Design)
- [开发进展与下一阶段](https://github.com/vsvcode-ai/ContextWeft/wiki/Development-Status)
- [接入与使用](https://github.com/vsvcode-ai/ContextWeft/wiki/Getting-Started)
- [仓库文档](https://github.com/vsvcode-ai/ContextWeft/tree/main/docs)

## 当前状态

已实现 Phase 1 基础：版本化契约、SQLite 事件日志、Git 快照、确定性 ContextPack、本地派生记忆、CLI 和 MCP stdio 工具。项目仍处于 alpha 预发布阶段。

无界面交接方案已完成复核并形成 v3 实施基线；handoff、resume、会话绑定及内容级 freshness 等新增能力待按方案实施。

## 下一阶段

依次完成契约与迁移、Git 内容检测、交接应用用例、CLI/MCP 接口、Agent 指令模板。以两个真实 Agent 完成一次自然语言交接作为验收标准。

完整设计以[仓库中的版本化方案](https://github.com/vsvcode-ai/ContextWeft/blob/main/docs/headless-handoff-design.zh-CN.md)为准；Wiki 提供导航和同步视图。
