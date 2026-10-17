# GitHub Wiki 维护

GitHub Wiki 地址：https://github.com/vsvcode-ai/ContextWeft/wiki 。编辑权限限制为仓库协作者。

本目录保留 Home、Development-Status 和 Getting-Started 三个页面的源文件。`Headless-Handoff-Design` 来自 `docs/headless-handoff-design.zh-CN.md`，同步时将该文档中的仓库相对链接转换为 `https://github.com/vsvcode-ai/ContextWeft/blob/main/` 下的对应链接，保持章节内容一致。

更新步骤：

1. 修改仓库中的页面或实施方案，检查本地链接及已实现 / 待实现状态。
2. 提交并推送主仓库，再将这些页面同步到 `git@github.com:vsvcode-ai/ContextWeft.wiki.git`。
3. 同步 `_Sidebar.md`、`_Footer.md` 的导航和源文档说明，检查 Wiki 渲染与页面链接。
4. Wiki 内容引用主仓库版本化方案；方案和功能交付状态分别维护。
