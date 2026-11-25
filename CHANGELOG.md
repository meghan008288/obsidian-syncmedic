# Changelog

## 0.1.4 - 2026-11-25

### English

- The whole plugin UI is now English: the commands, the ribbon tooltip, the notices, the settings tab, the report, the log source labels, and all 22 rule titles and fix steps. The failure fingerprints themselves are untouched, so detection behaves exactly as before.
- Rule titles were shortened so the one-line summary stays readable.

### 中文

- 插件界面全面改成英文:命令、侧栏图标提示、通知、设置页、报告、日志来源标签,以及 22 条规则的标题与修复步骤。匹配用的指纹一个字都没改,检测行为和之前完全一致。
- 规则标题压短了,一行摘要更好读。

## 0.1.3 — 2026-11-24

### English

- The plugin is now listed in the official community directory:
  <https://community.obsidian.md/plugins/syncmedic>. The README says so, instead
  of "under review".
- Release assets are now signed with a SLSA build provenance attestation, so
  users can verify that `main.js` was built from this repository.

### 中文

- 插件已收录进官方社区目录：<https://community.obsidian.md/plugins/syncmedic>。README 里的状态从「审核中」改成「已上线」。
- Release 附件现在带 SLSA build provenance 签名，用户可以验证 main.js 确实是由这个仓库构建出来的。

## 0.1.2 — 2026-11-24

### English

- Fixed the two errors the community directory scan reported:
  - the manifest description no longer contains the word "Obsidian"
  - `vault.getFolderByPath()` (Obsidian 1.5.7) is replaced by `getAbstractFileByPath()`, so no API newer than the declared `minAppVersion` is used
- The configuration folder is no longer hard-coded: it is read from `vault.configDir`, and the collector resolves the plugin folders from it
- README is now English; the Chinese version is kept in `README.zh-CN.md`
- Dropped the `builtin-modules` dependency in favour of `node:module`
- Replaced the ideographic spaces in the report with plain separators
- Added two tests: the official display-name rules, and that the configuration folder comes from the adapter

### 中文

- 修掉官方扫描报的两个 Error：描述里不再出现 "Obsidian"；`vault.getFolderByPath()`（Obsidian 1.5.7）换成 `getAbstractFileByPath()`，不再用超出 minAppVersion 的 API
- 配置目录不再写死，改为读 `vault.configDir`，采集器按它解析插件目录
- README 改成英文，中文版保留在 `README.zh-CN.md`
- 去掉 `builtin-modules` 依赖，改用 `node:module`
- 报告里的全角空格换成普通分隔符
- 新增两条测试：官方显示名规则、配置目录来自 adapter

## 0.1.1 — 2026-11-24

### English

- Renamed the plugin to **SyncMedic**. The old name carried Chinese characters and an em dash; the community directory only accepts Basic Latin names without punctuation, and rejected the first submission over it.
- English package description, and `author` now reads `Meghan`.
- README title is English and the distribution table matches the published release.
- Added a unit test that pins the official display-name rules.

### 中文

- 插件更名为 **SyncMedic**。原名含中文和破折号，不符合官方社区目录的命名要求，首次提审被拒。
- package.json 的描述改成英文，`author` 填 `Meghan`。
- README 标题改成英文，分发状态表改成与实际发布情况一致。
- 补了一条单元测试，把官方对显示名的命名规则固化成断言。

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
