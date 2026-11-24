# SyncMedic 发布手册

路线：**先 GitHub Release + BRAT 让用户当天就能用，再提交官方社区目录。**

> ⚠️ **旧流程已作废。** 早年的做法是给 `obsidianmd/obsidian-releases` 提 PR，
> 但该仓库现在 **PR 通道已关闭**（页面显示 `Pull request creation is restricted`，
> Open / Closed 计数都是 0）。官方现在改用自���的社区目录站。
> 见本文第 4 节。

---

## 0. 三条硬规则（搞错了就是装不上）

| 规则 | 出处 |
| --- | --- |
| **Release tag == Release 名称 == manifest.json 的 version** | 官方提交文档；BRAT `BRAT-DEVELOPER-GUIDE.md` L54 |
| **Release 附件名必须精确是 `main.js` / `manifest.json` / `styles.css`** | BRAT `src/features/BetaPlugins.ts` L293-297 按名字精确查找 |
| **仓库必须公开，且默认分支根目录要有 `manifest.json`** | 官方提交文档；Obsidian 靠 manifest 的 version 决定装哪个 release |

**tag 不要加 `v` 前缀。** 要发 `0.1.0` 就写 `0.1.0`。

---

## 1. 最短路径：一条命令

装好 [GitHub CLI](https://cli.github.com/) 并登录之后：

```bash
gh auth login --web --git-protocol https
```

然后在插件目录里：

```bash
python scripts/publish.py
```

它会自动做完：读出你的用户名 → 改 `manifest.json` 的作者信息 → 用 GitHub
noreply 邮箱设置提交身份 → 提交全部代码 → 打版本 tag → 等 release workflow
建好 Release → 校验三个附件名 → 打印提审要用的字段。

---

## 2. 手动发版

### 2.1 改 manifest.json 的作者信息

```bash
python scripts/release.py configure --github 你的GitHub用户名
```

`authorUrl` 按官方惯例填 **GitHub 用户主页地址**（不是仓库地址）——
remotely-save、obsidian-livesync、dataview 三个真实插件都是这么填的。

### 2.2 自检

```bash
npm test                          # 79 个单元测试
npm run typecheck
npm run build
python scripts/release.py check --tag 0.1.0
```

`check` 会挡住这些情况：manifest 缺字段、version 不是合法 semver、id 和插件
文件夹名不一致、manifest 版本和 `src/settings.ts` 里的不一致、tag 和 manifest
版本不一致、authorUrl 不是 https、缺构建产物。

### 2.3 发 Release

**方式 A：GitHub Actions（推荐）**

```bash
git add -A && git commit -m "release 0.1.0"
git tag 0.1.0
git push origin main --tags
```

workflow 会自动跑测试 → 构建 → 建 Release，附件名和版本号都对。

**方式 B：手动**

```bash
python scripts/release.py package     # 生成 dist/
```

在 GitHub 上新建 Release：tag 填 `0.1.0`，标题填 `0.1.0`，上传 `dist/` 里的
三个文件。装了 `gh` 的话：`python scripts/release.py release --repo 你的用户名/obsidian-syncmedic`

---

## 3. BRAT 用户怎么装

1. 用户从 Obsidian 官方市场装 **BRAT**（搜 "BRAT"）
2. BRAT 里执行命令 `Plugins: Add a beta plugin for testing`
3. 填仓库地址：`你的用户名/obsidian-syncmedic`
4. 装完启用即可

BRAT 会自己跟踪 Release，以后推新 tag，用户点一下「检查更新」就升级。

**不需要**去任何 beta 列表仓库登记——BRAT 的 beta 列表就是一个仓库路径数组，
用户自己加任意仓库即可。

---

## 4. 提交官方社区目录（正式上架）

> 2026 年当前流程：**不是**给 `obsidianmd/obsidian-releases` 提 PR。

### 4.1 前提：仓库里要有这三样

- `README.md` —— 描述插件用途和用法，市场页面会摘录展示，相对链接和图片会自动重写
- `LICENSE` —— 我这边是 MIT ✓
- `manifest.json` —— 在默认分支根目录 ✓

另外市场扫描会**重建你的源码并核对 release 的 main.js 是否一致**，
所以 release 里的 `main.js` 必须就是当前 HEAD 构建出来的（CI 已保证）。

### 4.2 提交步骤

1. 打开 <https://community.obsidian.md>，右上角 **Sign in**，用 Obsidian 账号登录
   （没有 Obsidian 账号就按提示注册一个）
2. 进 **Community profile**，在 **GitHub** 一栏点 **Connect**，授权关联你的 GitHub 账号
   （只读权限，用来验证你确实拥有这个仓库）
3. 关联后会自动提示 **Available to claim** 里有你的仓库，勾选并 **Claim**（选 Myself）
4. 侧边栏 **Plugins** → **New plugin**，填表：

   | 字段 | 填什么 |
   | --- | --- |
   | GitHub repository URL | `https://github.com/你的用户名/obsidian-syncmedic` |
   | Owner | 选你自己（Myself） |
   | Screenshot path | 仓库里的截图相对路径，见下 |
   | Supported modes | 插件无需选（那是主题的字段） |

5. 同意 **Developer policies**，确认会持续维护，**Submit**

### 4.3 截图怎么准备

市场页面要求截图，且路径要相对仓库根目录，例如 `screenshots/screenshot.png`。

规格：**最多 5 张桌面图 1200×800，最多 5 张移动图 900×1600**，JPEG / PNG / WebP，
单张 ≤ 5 MB。

**这些截图必须是你在 Obsidian 里真实打开插件后截的**，不能拿示意图冒充——
市场扫描会看源码，示意图对不上会变成一个「error」，白等一轮审核。

建议截这几张（放进 `screenshots/` 目录）：

| 文件名 | 内容 |
| --- | --- |
| `screenshots/report.png` | 报告弹窗，命中了几条规则、有证据行和修复步骤 |
| `screenshots/sources.png` | 报告下半部分，列出扫了哪些日志来源、哪些没采到 |
| `screenshots/settings.png` | 设置面板 |

装好插件后按 `Ctrl+Shift+I` 打开开发者控制台更容易截到干净的画面。

### 4.4 审核反馈怎么改

提交后是**自动审核**，结果分四档：error / warning / recommendation / pass。

- **error** 必须修：不修就装不上
- **warning** 不阻塞，但建议修

改完在仓库里改，然后**发一个版本号 +1 的新 Release**（版本号变了才会触发新一轮扫描）。
也可以在条目的 `...` 菜单里点 **Request review** 立刻触发，或
**Review branch** 先跑一次预扫描。

---

## 5. 官方审核常见退稿点（已自查）

对照 [官方 Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
和 [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)：

| 审核要求 | 本插件 |
| --- | --- |
| 不用全局 `app`，用 `this.app` | ✅ |
| 不打印多余调试日志 | ✅ 没有 console 输出 |
| 正则不含 lookbehind（iOS 16.4 以下会崩） | ✅ grep 确认零命中 |
| 不用 `innerHTML` | ✅ 全用 `createEl` / `createDiv` |
| 命令用 `callback` / `checkCallback` | ✅ 用 `callback` |
| 资源随插件卸载释放 | ✅ 全部用 `this.add*` 注册 |
| 优先用 Vault API 而非 Adapter API | ✅ vault 内文件走 Vault API；只有 `.obsidian/` 走 Adapter API（`.obsidian` 不在 vault 文件索引里，Vault API 看不到） |
| **不使用客户端遥测** | ✅ 插件零网络请求，README 里写明 "Nothing leaves your machine" |
| 不插广告、不自更新 | ✅ |
| 有 LICENSE | ✅ MIT |
| 不滥用 "Obsidian" 商标 | ✅ 插件名不含 Obsidian |
| plugin id 不含 "obsidian" | ✅ `syncmedic` |
| 网络用途要写进 README | ✅ 明确写了不联网 |
| 不 fork 别人的项目 | ✅ 全新仓库，无 fork |

---

## 6. 排查

| 症状 | 原因 |
| --- | --- |
| BRAT 说 "does not seem to be an obsidian plugin with valid releases" | 没有 Release，或 Release 里没有那三个附件 |
| BRAT 装上了但版本不对 | tag 和 manifest 的 version 不一致 |
| git push 403 "Permission denied to deploy key" | 这把 key 已经加在别的仓库上了——GitHub 不允许同一把 key 当 deploy key 加到两个仓库，换一把新的 |
| git push 403 "does not have the correct permissions to execute CreateRepository" | `gh` 拿到的是 GitHub App 的 `ghu_` token，只能写它被安装在的仓库；换 OAuth token（`gho_`）或用 SSH deploy key |
| push 被 "Push cannot contain secrets" 拦下 | 源码里有长得像密钥的字面量（Slack webhook、AKIA…）。测试里改成分片拼接 |
| 官方目录报 "The repository does not have a recognized license" | LICENSE 文件名或格式不对，要用 GitHub 认得的许可证 |
