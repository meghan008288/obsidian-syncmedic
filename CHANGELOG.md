# Changelog

## 0.1.7 - 2026-11-26

### English

- Fixed the end-to-end encryption rule. It matched "main: receiving error in ...", a string that only ever existed as a commented out `console.debug` call in the upstream source, so the rule could never fire on a real log. It now matches the seven strings that `remotely-save` 0.5.25 really prints, and each of them is pinned to the upstream file it comes from.
- A rule can now be pinned to several upstream places at once. The checker reports a rule as drifted only when every one of its fingerprints is gone; a rule that lost some of them is reported but does not fail the job.
- Fixed the drift check on Linux. It called `curl.exe`, which only exists on Windows, so on the scheduled runner every request failed and a real drift could never have been reported. It now picks the binary that fits the platform, reads the HTTP status back, and tells a network failure apart from a fingerprint that really moved.
- A broken network no longer files a false "Fingerprint drift detected" issue. The check now exits with 1 when a fingerprint moved and with 2 when the upstream could not be reached, and only the first one opens an issue.
- Retaken the marketplace screenshots. The old ones showed version 0.1.5, one of them showed a desktop with a private conversation on it instead of the plugin, and the Obsidian interface was in Chinese.

### 中文

- 修好了端到端加密这条规则。它匹配的是「main: receiving error in ...」,而这个串在上游只是一行被注释掉的 `console.debug`,所以规则从来不可能在真实日志上命中。现在它匹配 remotely-save 0.5.25 真正会打印的 7 个串,每一个都锚定到它出处的那份上游文件。
- 一条规则现在可以同时锚定多个上游位置。检测器只有在一条规则的指纹**全部**消失时才判定它漂移;只丢了一部分的会被记录下来,但不会让任务失败。
- 修好了漂移检测在 Linux 上跑不起来的问题:它写死了 `curl.exe`,这个文件只有 Windows 有,定时任务每次请求都会失败,真漂移反而报不出来。现在会按平台选可执行文件,会把 HTTP 状态码读回来,也能区分「网络不通」和「指纹真的没了」。
- 网络故障不会再误开一个假的「Fingerprint drift detected」issue:真的漂移退出码是 1,连不上上游退出码是 2,只有前者才开 issue。
- 重拍了市场截图:旧图里还写着 0.1.5,其中一张拍到的是带私人对话的桌面而不是插件本身,而且 Obsidian 界面是中文。

## 0.1.6 - 2026-11-25

### English

- The repository now ships a fingerprint drift detector. Every rule is pinned to the upstream file or issue its fingerprint came from, a scheduled workflow checks that the text is still there, and a fingerprint that disappeared opens an issue instead of silently breaking the diagnosis. See `docs/fingerprint-drift.md`.
- Fixed the test setup. The release workflow ran on Node 20, where the test runner finds no `.test.ts` files at all, so the "Unit tests" step had been passing without running anything. The workflow now runs Node 24 and every test really executes.

### 中文

- 仓库新增指纹漂移检测:每条规则都锚定到它出处的那份上游文件或 issue,定时任务会检查那段文字是否还在;一旦消失就开 issue,而不是让诊断静默失效。详见 `docs/fingerprint-drift.md`。
- 修好了测试流程:发布工作流之前跑在 Node 20 上,而 Node 20 的测试发现根本找不到 `.test.ts` 文件,所谓「Unit tests」那一步其实什么都没跑就绿灯了。现在工作流用 Node 24,88 个测试真的会执行。

## 0.1.5 - 2026-11-25

### English

- The report now names the file each piece of evidence came from, so a rule that matched in several log files can be traced back to the right one.
- Removed the "Hosted fix service URL" setting. It pointed at a domain nobody owns and no code ever read it.

### 中文

- 报告里的每条证据现在都带上来源文件名,一条规则在多个日志里命中时能直接对上是哪个文件。
- 删掉了「托管修复服务地址」设置:它指向一个没人持有的域名,而且代码从来没读过它。

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
