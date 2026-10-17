# 接入与使用

更新日期：2026-10-17。以下使用当前已实现的 Phase 1 接口。

## 构建本地 CLI

要求 Node.js 22 或更新版本、pnpm 10 和 Git。在 ContextWeft 源码仓库执行：

```bash
pnpm install --frozen-lockfile
pnpm build
```

项目尚未发布稳定 npm 版本。下文使用本地构建产物的绝对路径，将 `/absolute/path/to/ContextWeft` 替换为真实位置。

## 在目标仓库保存上下文

切换到需要交接的 Git 仓库，再执行：

```bash
node /absolute/path/to/ContextWeft/apps/cli/dist/main.js init --name "My project"
node /absolute/path/to/ContextWeft/apps/cli/dist/main.js task start --title "Continue feature work" --goal "Ship the next verified change"
node /absolute/path/to/ContextWeft/apps/cli/dist/main.js task status
```

保存命令返回的 work item ID。让当前 Agent 根据实际工作生成 `checkpoint.json`，例如：

```json
{
  "summary": "已定位相关代码，准备开始实现。",
  "completed": ["完成代码路径分析"],
  "pending": ["实现变更", "运行相关验证"],
  "nextActions": ["按已确认的方案修改代码并运行相关测试"]
}
```

然后调用 checkpoint，把 `<WORK_ITEM_ID>` 替换为实际返回值：

```bash
node /absolute/path/to/ContextWeft/apps/cli/dist/main.js checkpoint --work-item '<WORK_ITEM_ID>' --input checkpoint.json
```

命令行工具能采集 Git 状态；会话中的决策、失败原因和验证结果由当前 Agent 提交。示例文本应按实际工作替换。

## 在另一个 Agent 内恢复

在同一目标仓库执行：

```bash
node /absolute/path/to/ContextWeft/apps/cli/dist/main.js bootstrap --work-item '<WORK_ITEM_ID>' --intent "Continue implementation"
```

让 Agent 读取返回的上下文包，核对来源和当前代码后继续。现阶段任务 ID 需要明确传入；计划中的 handoff、resume 和会话绑定将简化这一流程，目前尚未实现。

## MCP 接入

服务启动入口是：

```bash
node /absolute/path/to/ContextWeft/apps/cli/dist/main.js mcp
```

当前服务根据启动目录定位仓库，需确认客户端使用目标 Git 仓库作为服务 cwd。固定 `mcp --root` 是 v3 方案中的待实现能力。

已实现的八个工具：workspace_init、work_item_start、workspace_status、checkpoint、bootstrap、search、remember、correct_fact，均使用 `contextweft.` 前缀。MCP 写操作要求 idempotencyKey，重试同一操作时保持 key 不变。

配置方式和完整的 Cursor MCP 验证步骤见[客户端测试指南](https://github.com/vsvcode-ai/ContextWeft/blob/main/docs/cursor-mcp-testing.zh-CN.md)。配置生成和版本化工具说明见[中文 README](https://github.com/vsvcode-ai/ContextWeft/blob/main/README.zh-CN.md)。
