# SyncMedic — 同步急诊室

给 Obsidian 的同步故障做一次**本地体检**，直接告诉你：是哪个问题、证据在哪、怎么修。

支持 **Remotely Save** 和 **Self-hosted LiveSync**。

---

## 这是干什么的

同步出问题时，Obsidian 控制台里全是这种话：

```
plugin:remotely-save:234 Error: Request failed, status 403
```

然后你就得自己去 GitHub 上翻几百条 issue，一边翻一边猜"这条是不是我的问题"。

SyncMedic 把这件事做成了一步：

1. 它去你的 vault 里把相关日志捞出来（不联网、不上传）
2. 用 **22 条真实故障指纹**去比对，每条指纹都来自上游仓库的源码或用户贴出的真实报错
3. 给你一份可以直接贴到 GitHub issue 的报告：哪条规则命中、证据第几行、怎么修、上游 issue 链接

报告里的所有敏感信息（token、密码、邮箱、路径）**在生成之前就已经被替换掉了**，所以你可以放心地整段复制粘贴。

---

## 三步用起来

**第 1 步：准备好日志**

SyncMedic 会自动去找下面这些地方，找到多少算多少：

| 来源 | 在哪 | 怎么才有 |
| --- | --- | --- |
| LiveSync 日志 | vault 根目录 `livesync_log_*` | LiveSync 设置里打开 **Write logs into the file** |
| Remotely Save 调试导出 | vault 里的 `_debug_remotely_save/` | 用 Remotely Save 的调试导出功能导出日志历史 |
| Logstravaganza 笔记 | vault 根目录 `LOGGING-NOTE*.md` | 装 Logstravaganza 插件（Remotely Save 官方文档推荐的 iOS 做法） |
| 插件目录里的 `.log` | `.obsidian/plugins/*/` | 上游偶尔会落盘 |

> **注意：Remotely Save 自己不写日志文件**，它只往 Obsidian 控制台输出。所以要么用它的调试导出，要么直接把控制台内容粘进来。

**第 2 步：跑体检**

- 命令面板 → `SyncMedic: 运行同步体检`
- 或者点左侧栏的听诊器图标
- 如果上面都没捞到东西 → `SyncMedic: 粘贴控制台日志并体检`，把控制台里相关的输出整段粘进去

**第 3 步：拿报告**

弹窗里有三个按钮：

- **复制报告** — 直接贴到 GitHub issue，已经脱敏过了
- **导出为笔记** — 存成 vault 里的一篇 markdown
- **复制 JSON** — 给脚本用

---

## 隐私

- **日志只在本机解析**，不发到任何服务器。代码里没有网络请求，也没有遥测。
- 脱敏发生在**匹配之前**：密钥先被替换成 `[REDACTED:xxx]`，再拿去和故障指纹比对。因为指纹认的是错误周围的结构，不是密钥本身，所以脱敏不会影响命中。
- 报告渲染时还会再脱敏一次（纵深防御）。

---

## 22 条故障指纹

每条指纹都有出处：**「源码确认」**表示这个字符串在插件发布的源码里真实存在；**「issue 原文」**表示这是用户贴进上游 issue 的真实报错输出。

| ID | 插件 | 级别 | 问题 | 指纹出处 | 上游 issue |
| --- | --- | --- | --- | --- | --- |
| `RS-01` | Remotely Save | 严重 | OneDrive 授权被拒（403）：令牌过期或权限没批下来 | issue 原文 | [#11](https://github.com/remotely-save/remotely-save/issues/11) [#920](https://github.com/remotely-save/remotely-save/issues/920) |
| `RS-02` | Remotely Save | 警告 | OneDrive 429 限流：请求发得太急 | issue 原文 | [#1121](https://github.com/remotely-save/remotely-save/issues/1121) |
| `RS-03` | Remotely Save | 严重 | Graph API 400：给文件夹用了 conflictBehavior: replace | issue 原文 | [#1170](https://github.com/remotely-save/remotely-save/issues/1170) |
| `RS-04` | Remotely Save | 严重 | WebDAV 405 Method Not Allowed：配置目录或特殊文件名写不进去 | 源码确认 | [#986](https://github.com/remotely-save/remotely-save/issues/986) |
| `RS-05` | Remotely Save | 严重 | 变更比例超限，同步被主动中止 | issue 原文 | [#945](https://github.com/remotely-save/remotely-save/issues/945) |
| `RS-06` | Remotely Save | 警告 | 网络抖动导致 ERR_NETWORK_IO_SUSPENDED | issue 原文 | [#732](https://github.com/remotely-save/remotely-save/issues/732) |
| `RS-07` | Remotely Save | 警告 | 远端文件删除 / 移动失败 | 源码确认 | [#991](https://github.com/remotely-save/remotely-save/issues/991) |
| `RS-08` | Remotely Save | 警告 | 本地同步数据库被锁或被删 | 源码确认 | [#1151](https://github.com/remotely-save/remotely-save/issues/1151) |
| `RS-09` | Remotely Save | 严重 | 端到端加密 worker 报错：文件加解密失败 | 源码确认 | [#1065](https://github.com/remotely-save/remotely-save/issues/1065) |
| `RS-10` | Remotely Save | 严重 | OneDrive 令牌刷新卡住，连接停在 Connecting to OneDrive | issue 原文 | [#920](https://github.com/remotely-save/remotely-save/issues/920) |
| `RS-11` | Remotely Save | 提示 | 远端连接自检未通过 | 源码确认 | [#840](https://github.com/remotely-save/remotely-save/issues/840) |
| `LS-01` | LiveSync | 严重 | CORS 预检失败：服务器没放行 OPTIONS 请求 | issue 原文 | [#588](https://github.com/vrtmrz/obsidian-livesync/issues/588) |
| `LS-02` | LiveSync | 严重 | 同步被取消：TypeError: Failed to fetch | issue 原文 | [#588](https://github.com/vrtmrz/obsidian-livesync/issues/588) |
| `LS-03` | LiveSync | 严重 | 服务器返回的不是 JSON（多半返回了登录页） | issue 原文 | [#588](https://github.com/vrtmrz/obsidian-livesync/issues/588) |
| `LS-04` | LiveSync | 警告 | 客户端配置不一致 | issue 原文 | [#606](https://github.com/vrtmrz/obsidian-livesync/issues/606) |
| `LS-05` | LiveSync | 严重 | chunk 收集失败：文件在数据库里找不到 | issue 原文 | [#505](https://github.com/vrtmrz/obsidian-livesync/issues/505) |
| `LS-06` | LiveSync | 严重 | 数据库未解锁 | 源码确认 | [#815](https://github.com/vrtmrz/obsidian-livesync/issues/815) |
| `LS-07` | LiveSync | 严重 | Android 端 SSL 握手失败 | issue 原文 | [#37](https://github.com/vrtmrz/obsidian-livesync/issues/37) |
| `LS-08` | LiveSync | 警告 | 远端配置解析或导入失败 | 源码确认 | [#606](https://github.com/vrtmrz/obsidian-livesync/issues/606) |
| `LS-09` | LiveSync | 警告 | 文件冲突未解决，需要手动合并 | 源码确认 | [#151](https://github.com/vrtmrz/obsidian-livesync/issues/151) [#813](https://github.com/vrtmrz/obsidian-livesync/issues/813) |
| `LS-10` | LiveSync | 警告 | 数据库里存在已删除文件，可能被重新拉回来 | 源码确认 | [#151](https://github.com/vrtmrz/obsidian-livesync/issues/151) [#813](https://github.com/vrtmrz/obsidian-livesync/issues/813) |
| `LS-11` | LiveSync | 严重 | 重建或初始化被中断 | 源码确认 | [#762](https://github.com/vrtmrz/obsidian-livesync/issues/762) |

修复步骤写在 `src/rules.ts` 里，每条都写成可以直接照做的操作，不是"建议检查网络"这种废话。

---

## 下载与安装

插件有三个分发渠道，**成熟度依次递增**：

| 渠道 | 用户怎么装 | 需要什么 | 现在能用吗 |
| --- | --- | --- | --- |
| **手动安装** | 下载 zip 解压到 vault | 一个 zip | ✅ 已经可以 |
| **GitHub Release + BRAT** | 装 BRAT，填仓库地址 | 公开 GitHub 仓库 + 一个 Release | ⏳ 需要先建仓库 |
| **Obsidian 官方社区插件市场** | 市场里搜 "SyncMedic"，点安装 | 公开仓库 + 提交官方审核 | ⏳ 需要先建仓库 |

### 渠道一：手动安装（当前唯一开箱可用的方式）

下载 `syncmedic-0.1.0.zip`，解压到你的 vault 里：

```
<你的 vault>/.obsidian/plugins/syncmedic/
├── manifest.json
├── main.js
└── styles.css
```

然后：Obsidian → 设置 → 第三方插件 → 关掉「安全模式」→ 刷新 → 启用 **SyncMedic**。

> `data.json` 是插件自己生成的设置文件，不用手动建。

### 渠道二：GitHub Release + BRAT（推荐给早期用户）

1. 作者在 GitHub 上发一个 Release，附件包含 `main.js`、`manifest.json`、`styles.css`
2. 用户先从官方市场装 **BRAT**（社区插件市场搜 "BRAT"）
3. BRAT 里执行命令 `Plugins: Add a beta plugin for testing`，填仓库地址

> **BRAT 装的是 GitHub Release 的附件，不是分支或源码树。** 仓库里没有可用的 Release，BRAT 就装不了。所以发 Release 时必须把三个文件作为附件挂上去。

这条链路的好处：不用等官方审核，作者一改就能自动推给所有内测用户。

### 渠道三：Obsidian 官方社区插件市场（最终形态）

用户能直接在 Obsidian 里搜到、一键安装、自动更新。代价是要走审核。

发布流程：

1. 把源码推到**公开** GitHub 仓库（官方 2026 起的规则：公开源码是常态，闭源插件暂不收录但需申报）
2. 发一个 Release，附上 `main.js` / `manifest.json` / `styles.css`
3. 给 [`obsidianmd/obsidian-releases`](https://github.com/obsidianmd/obsidian-releases) 提 PR，在 `community-plugins.json` 里加一行：

   ```json
   { "id": "syncmedic", "name": "SyncMedic", "author": "你的名字", "repo": "你的账号/obsidian-syncmedic" }
   ```

4. 官方会跑自动扫描，再人工审核，通过后插件出现在市场里

审核常见退稿意见见 [官方 Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)。本插件已经对照过一遍，已处理的包括：不用全局 `app`、不打印调试日志、正则不含 lookbehind（iOS 16.4 以下安全）、不用 `innerHTML`、命令用 `callback`、资源随插件卸载自动释放、**vault 内文件走 Vault API，只有 `.obsidian/` 插件目录才用 Adapter API**（`.obsidian` 不在 vault 文件索引里，Vault API 看不到）。

---

### 给自己构建

```bash
npm install
npm run build
```

### 要发布这个插件

完整操作手册见 [`RELEASE.md`](./RELEASE.md)。最短路径：

```bash
python scripts/release.py configure --github 你的GitHub用户名   # 改作者信息
python scripts/release.py check --tag 0.1.0                     # 发版前自检
python scripts/release.py package                              # 生成 dist/ 发布物料
python scripts/release.py entry --repo 你的用户名/obsidian-syncmedic   # 生成提审行
```

推上 `0.1.0` 这个 tag 后，GitHub Actions 会自动跑测试、构建、发 Release。


---

## 开发

```bash
npm install

npm test          # 69 个单元测试（Node 内置 test runner，无额外依赖）
npm run typecheck # tsc --noEmit
npm run build     # 打包出 main.js
node scripts/verify.ts   # 用 samples/ 里的真实日志样本跑一遍端到端
```

### 代码结构

```
src/
├── redact.ts    脱敏：14 类密钥 / 个人信息，幂等，命中不误伤普通句子
├── rules.ts     22 条故障指纹 + 修复步骤 + issue 链接
├── logs.ts      运行时发现日志来源（跨平台，走 vault.adapter）
├── report.ts    Markdown / JSON / 一句话摘要渲染
├── pipeline.ts  采集 → 脱敏 → 匹配 → 报告
├── settings.ts  设置项与归一化
├── obsidian-adapter.ts  Vault API / Adapter API 的分流
├── ui.ts        报告弹窗 / 粘贴弹窗 / 设置面板
└── main.ts      插件入口：命令、图标、设置页
```

`redact.ts` / `rules.ts` / `logs.ts` / `report.ts` / `pipeline.ts` / `settings.ts` **不依赖 Obsidian**，全部有单元测试。`ui.ts` / `main.ts` / `obsidian-adapter.ts` 只做绑定。

### 设计上的几个硬规矩

1. **不硬编码日志路径**。上游随时会改文件名，所以运行时扫描 + 认领，靠文件名特征判断归属。
2. **规则只在证据里找，不猜**。每条指纹要么在源码里，要么在用户贴出的真实报错里。
3. **脱敏必须精确到值，不能毁掉结构**。规则认的是错误周围的结构，所以密钥被换成 `[REDACTED:xxx]` 之后，规则照样命中。
4. **报告可以公开**。这是它能拿去发 issue 的前提。

---

## 现在还没做的

说清楚比吹嘘有用：

- **托管修复 / 托管中继**（付费层）还没做。目前只有本地诊断。
- **没有登录 / 订阅 / 支付**。付费版的收费点要放在服务端（客户端校验可以被 patch 掉），这是设计上的决定，不是遗漏。
- **规则是静态的**，还没做"新 issue 自动变规则"的抓取器。
- **只支持这两个插件**。其它同步插件（GitSync 等）不在范围内。
- `manifest.json` 里的 `author` 和 `authorUrl` 现在是占位值，发布前用一条命令换成你的：
  ```bash
  python scripts/release.py configure --github 你的GitHub用户名
  ```
  （`authorUrl` 按官方惯例填 GitHub 用户主页地址——remotely-save、obsidian-livesync、dataview 三个真实插件都是这么填的）
- **发布到市场还没做**：仓库、Release、提 PR 都是手工步骤，完整操作手册见 [`RELEASE.md`](./RELEASE.md)。

---

## 数据出处

这个插件的每一条规则都不是拍脑袋写的，出处如下：

- 上游 issue：Remotely Save 与 Self-hosted LiveSync 的仓库 issue 区，抓取时间 2026-11-24
- 上游源码：`remotely-save` 的 `src/baseTypes.ts`（`_debug_remotely_save/` 与 `log_hist_exported_on_` 前缀）、`src/debugMode.ts`、`src/fsWebdav.ts`、`src/fsDropbox.ts`；`obsidian-livesync` 的 `src/runCommand.ts`（数据库未解锁提示）、`src/modules/features/ModuleLog.ts`、`src/serviceFeatures/conflictResolution/*`、`src/features/LocalDatabaseMainte/CmdLocalDatabaseMainte.ts`
- Logstravaganza 的用法来自 Remotely Save 官方文档 `docs/how_to_debug/use_logstravaganza.md`
- LiveSync 日志文件名（`livesync_log_` 前缀、vault 根目录）来自该插件自己的 e2e 测试 `test/e2e-obsidian/scripts/dialog-mounts.ts`

---

## License

MIT
