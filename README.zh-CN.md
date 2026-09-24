# ContextWeft

[English](README.md) | 简体中文

为 AI 智能体提供可移植、权限感知的上下文基础设施。

ContextWeft 的目标是在编辑器、模型和智能体之间提供一层统一的 canonical
context。Phase 1 的实现聚焦在软件开发连续性：可信 checkpoint、确定性的
bootstrap pack、本地长期记忆，以及一套可被 Codex、Cursor、Claude Code 和其他
MCP 客户端复用的 MCP 工具面。

## 当前状态

Phase 1 foundation 已完成本地实现并有测试覆盖。项目仍处于预发布阶段，首个 alpha
tag 之前公开 API 仍可能调整。

已实现：

- 面向 workspace、work item、canonical event、Git snapshot、artifact 和
  ContextPack 的版本化 JSON contract。
- canonical SQLite 事件存储，包含事务、迁移、幂等写入和跨实体校验。
- Git snapshot 捕获，包含仓库根目录校验和敏感路径过滤。
- 确定性 ContextPack compiler，包含 token budget、provenance、freshness、
  golden contract test 和 prompt-injection 边界渲染。
- 基于 `@melandlabs/memory-store` 的 OpenContext-derived 本地记忆；canonical
  event log 始终是 source of truth。
- CLI 和 MCP stdio server，暴露同一套 Phase 1 工作流。
- Codex、Cursor、Claude Code 的配置生成能力。

尚未实现：

- 托管同步、多设备复制或 SaaS control plane。
- 企业身份、RBAC、审计导出或策略管理。
- 当前本地 OpenContext memory-store 边界之外的 vector recall。
- 稳定 npm release。

## 快速开始

环境要求：

- Node.js 22 或更新版本
- pnpm 10 或更新版本
- Git

```bash
pnpm install
pnpm check
```

以下命令在仓库根目录执行，使用刚构建的 CLI。在另一个 Git 仓库中使用时，请把脚本路径换成 ContextWeft 构建产物的绝对路径；安装发布包后可直接使用 `ctxweft`。

在 Git 仓库中初始化 ContextWeft 本地状态：

```bash
node apps/cli/dist/main.js init --name "My workspace"
node apps/cli/dist/main.js task start --title "Continue feature work" --goal "Ship the next verified change"
node apps/cli/dist/main.js task status
```

通过 JSON 创建 checkpoint：

```bash
node apps/cli/dist/main.js checkpoint --work-item work_123 --input checkpoint.json
```

让下一个智能体继承上下文：

```bash
node apps/cli/dist/main.js bootstrap --work-item work_123 --intent "Continue implementation"
```

启动 MCP server：

```bash
node apps/cli/dist/main.js mcp
```

## MCP 客户端

生成配置说明，不会修改用户本机配置：

```bash
node apps/cli/dist/main.js setup codex
node apps/cli/dist/main.js setup cursor
node apps/cli/dist/main.js setup claude-code
```

自动化场景可以使用 JSON 输出：

```bash
node apps/cli/dist/main.js setup cursor --json
```

当前 MCP server 暴露以下工具：

- `contextweft.workspace_init`
- `contextweft.work_item_start`
- `contextweft.workspace_status`
- `contextweft.checkpoint`
- `contextweft.bootstrap`
- `contextweft.search`
- `contextweft.remember`
- `contextweft.correct_fact`

## 安全模型

ContextWeft 把生成出来的 pack 和召回记忆都视为不可信证据。canonical state 保存在本地
SQLite event log 中，derived memory 可以从 canonical events 重建。Phase 1 会拒绝
路径穿越和敏感 artifact path，拒绝 symlink state directory，收紧本地状态文件权限，
并在 canonical database 损坏时 fail closed。

依赖例外记录在
[docs/security/dependency-exceptions.md](docs/security/dependency-exceptions.md)。

## 开发

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:performance
pnpm build
pnpm test:stdio
pnpm security:audit
```

完整验证命令：

```bash
pnpm check
```

运行 benchmark：

```bash
pnpm bench
```

## 架构说明

- canonical events 是 append-only，并且与具体记忆引擎解耦。
- OpenContext memory 是 derived recall index，不是 source of truth。
- ContextPack 是确定性、受 token budget 约束、provenance-first 的交接载体。
- MCP 是第一阶段公开互操作边界；后续可以在其上叠加原生编辑器集成。

已实现的架构决策见 [docs/adr](docs/adr)。

## 开源协议

Apache License 2.0。详情见 [LICENSE](LICENSE)。
