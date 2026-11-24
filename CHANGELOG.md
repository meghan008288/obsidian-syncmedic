# Changelog

## 0.1.0 — 2026-11-24

首个版本。

### 功能

- 本地体检 Obsidian 同步故障，支持 **Remotely Save** 和 **Self-hosted LiveSync**
- **22 条故障指纹**，每条都锚定上游仓库的真实源码或用户贴出的真实报错，报告里直接给出上游 issue 链接
- 运行时发现日志来源，不硬编码路径：LiveSync 的 `livesync_log_*`、Remotely Save 的 `_debug_remotely_save/` 调试导出、Logstravaganza 笔记、插件目录里的 `.log`
- 支持直接粘贴 Obsidian 开发者控制台的输出
- **14 类敏感信息自动脱敏**，脱敏发生在匹配之前，报告可以整段贴到公开 issue
- 报告支持 Markdown（一键复制、导出为笔记）和 JSON 两种格式
- 桌面与移动端通用：vault 内文件走 Vault API，只有 `.obsidian/` 插件目录走 Adapter API

### 开发

- 79 个单元测试，覆盖脱敏、规则引擎、日志采集、报告渲染、编排流程与 manifest 规范
- `scripts/release.py` 把发布时的硬规则变成自动校验（tag / release 名称 / manifest 版本三者一致，BRAT 资产文件名精确匹配）
- GitHub Actions：推 tag 自动跑测试、构建并发 Release
