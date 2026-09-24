# Cursor MCP 测试指南

本文档用于在 Cursor 中连接本地 ContextWeft MCP Server，并完成一轮最小可验证流程。

## 前置条件

- Node.js 22 或更新版本
- pnpm 10 或更新版本
- 当前目录是 Git 仓库
- 已安装依赖并构建 CLI：

```bash
pnpm install
pnpm build
```

本地开发测试建议使用构建产物的绝对路径，避免 Cursor 找不到 `ctxweft` 命令。
在 ContextWeft 仓库根目录执行 `pwd`，把下面示例中的 `/absolute/path/to/ContextWeft` 换成输出的绝对路径。

## Cursor MCP 配置

在项目根目录创建或编辑 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "contextweft": {
      "command": "node",
      "args": [
        "/absolute/path/to/ContextWeft/apps/cli/dist/main.js",
        "mcp"
      ]
    }
  }
}
```

如果你已经把 `ctxweft` 安装到了 PATH，也可以使用更短的配置：

```json
{
  "mcpServers": {
    "contextweft": {
      "command": "ctxweft",
      "args": ["mcp"]
    }
  }
}
```

配置后重启 Cursor，或在 Cursor 设置里 reload MCP servers。

## 可用 MCP 工具

ContextWeft MCP Server 当前暴露这些工具：

- `contextweft.workspace_init`
- `contextweft.work_item_start`
- `contextweft.workspace_status`
- `contextweft.checkpoint`
- `contextweft.bootstrap`
- `contextweft.search`
- `contextweft.remember`
- `contextweft.correct_fact`

## Smoke Test

在 Cursor Chat 中使用 Agent 模式，并允许它调用 MCP 工具。建议从下面几条提示词开始。
写入工具需要 `idempotencyKey`。重试同一操作时保持 key 不变，新操作使用新 key。

### 1. 初始化 workspace

```text
请使用 ContextWeft MCP 初始化当前仓库为 workspace，name 使用 "Cursor MCP Smoke Test"。完成后告诉我 workspaceId。
```

预期结果：

- Cursor 调用 `contextweft.workspace_init`
- 返回内容中 `ok` 为 `true`
- 得到一个 `ws:` 开头的 `workspaceId`

### 2. 创建 work item

```text
请使用 ContextWeft MCP 创建一个 work item。title 是 "Verify Cursor MCP"，goal 是 "Validate ContextWeft MCP tools from Cursor"，idempotencyKey 是 "cursor-smoke-work-item"，workspaceId 使用刚才返回的值。完成后告诉我 workItemId。
```

预期结果：

- Cursor 调用 `contextweft.work_item_start`
- 得到一个 `work:` 开头的 `workItemId`

### 3. 记录一条长期记忆

```text
请使用 ContextWeft MCP 记录一条 memory：content 是 "Cursor can connect to the local ContextWeft MCP server."，kind 是 "fact"，confidence 是 1，idempotencyKey 是 "cursor-smoke-memory"。workspaceId 和 workItemId 使用刚才创建的值。
```

预期结果：

- Cursor 调用 `contextweft.remember`
- 返回一个 `evt:` 开头的事件 ID
- 如果出现 derived memory unavailable 警告，canonical event 仍然应该已经写入

### 4. 创建 checkpoint

```text
请使用 ContextWeft MCP 创建 checkpoint。summary 是 "Cursor MCP smoke test completed."，completed 包含 "Initialized workspace"、"Started work item"、"Recorded memory"，nextActions 包含 "Run bootstrap from Cursor"，idempotencyKey 是 "cursor-smoke-checkpoint"，workspaceId 和 workItemId 使用刚才的值。
```

预期结果：

- Cursor 调用 `contextweft.checkpoint`
- 返回 checkpoint event ID
- 至少写入一个 `checkpoint.created` 事件

### 5. Bootstrap 下一轮上下文

```text
请使用 ContextWeft MCP bootstrap 当前 work item。intent 是 "Continue verifying Cursor MCP integration"，tokenBudget 是 2000。请总结返回的 ContextPack。
```

预期结果：

- Cursor 调用 `contextweft.bootstrap`
- 返回 Markdown ContextPack
- ContextPack 中包含 goal、completed、next actions、provenance 等信息

### 6. 查询状态

```text
请使用 ContextWeft MCP 查询 workspace status，并告诉我当前 work item 数、canonical event 数和 artifact 数。
```

预期结果：

- Cursor 调用 `contextweft.workspace_status`
- 能看到刚才创建的 work item 和事件数量

## 终端校验

也可以在仓库根目录用 CLI 交叉验证：

```bash
node apps/cli/dist/main.js doctor --json
node apps/cli/dist/main.js task status --json
```

如果你使用 PATH 里的 `ctxweft`：

```bash
ctxweft doctor --json
ctxweft task status --json
```

## 常见问题

### Cursor 提示找不到 ctxweft

使用本文推荐的本地绝对路径配置：

```json
{
  "mcpServers": {
    "contextweft": {
      "command": "node",
      "args": [
        "/absolute/path/to/ContextWeft/apps/cli/dist/main.js",
        "mcp"
      ]
    }
  }
}
```

确认构建产物存在：

```bash
test -f apps/cli/dist/main.js && echo ok
```

### Cursor 看不到 MCP 工具

- 确认 `.cursor/mcp.json` 是合法 JSON
- 重启 Cursor 或 reload MCP servers
- 确认当前打开的是需要测试的 Git 仓库，并且 Cursor 配置中的 CLI 路径指向实际构建产物
- 确认 `pnpm build` 已成功

### doctor 显示 derived memory unavailable

这通常表示 OpenContext 派生索引不可用，但 canonical SQLite event log 仍然是事实来源。可以继续测试 workspace、work item、checkpoint、bootstrap 等核心流程。

### 提示不是 Git 仓库

Cursor 需要打开 ContextWeft 仓库根目录，或在 MCP 调用里传入正确的 `rootPath`。

## 完成标准

本轮 Cursor MCP 测试通过的最低标准：

- Cursor 能成功调用 `contextweft.workspace_init`
- 能创建 `work:` 开头的 work item
- 能写入至少一条 memory 或 checkpoint event
- 能通过 `contextweft.bootstrap` 返回 ContextPack
- 终端执行 `node apps/cli/dist/main.js doctor --json` 可返回诊断报告
