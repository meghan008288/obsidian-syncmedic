# SyncMedic 发布手册

路线：**先 GitHub Release + BRAT 让用户当天就能用，同时准备官方社区插件市场的提审 PR。**

---

## 最快路径：一条命令

装好 [GitHub CLI](https://cli.github.com/) 并登录之后：

```bash
gh auth login --web --git-protocol https
```

然后在插件目录里：

```bash
python scripts/publish.py
```

它会自动做完这些事：

1. 从 GitHub API 读出你的用户名
2. 把 `manifest.json` 的 `author` / `authorUrl` 改成你的
3. 用 GitHub noreply 邮箱设置提交身份（不需要你的真实邮箱），提交全部代码
4. 建**公开**仓库 `<你的用户名>/obsidian-syncmedic` 并推送
5. 打 `0.1.0` 这个 tag，推上去，等 release workflow 建好 Release
   （workflow 不出活就本地兜底创建）
6. 校验 Release 附件名是不是精确的 `main.js` / `manifest.json` / `styles.css`
7. 打印提交官方市场要用的那一行 JSON

下面是不用脚本时的手工步骤。

---

## 0. 三条硬规则（搞错了就是装不上）

这三条是从上游工具的源码里读出来的，不是经验之谈：

| 规则 | 为什么 | 出处 |
| --- | --- | --- |
| **Release tag、Release 名称、manifest.json 里的 version 必须三者完全相同** | Obsidian 的更新器要求三者一致；BRAT 只警告并覆盖，但官方更新器不认 | `BRAT-DEVELOPER-GUIDE.md` L54；BRAT `src/features/BetaPlugins.ts` L185-203 |
| **Release 附件名必须精确是 `main.js` / `manifest.json` / `styles.css`** | BRAT 按文件名精确查找，多一个字符就找不到 | BRAT `src/features/BetaPlugins.ts` L293-297、L314-316 |
| **仓库必须是公开的，且默认分支根目录要有 `manifest.json`** | BRAT 抓不到 Release 就报错；Obsidian 靠根目录的 manifest 认这是个插件仓库 | BRAT `src/features/BetaPlugins.ts` L132、L142；官方文档「Rename the plugin folder to match the plugin's id」 |

**tag 不要加 `v` 前缀。** 要发 `0.1.0` 就写 `0.1.0`。加了 `v` 就变成 `v0.1.0` ≠ `0.1.0`，三者不一致。

---

## 1. 改成你自己的 GitHub

```bash
python scripts/release.py configure --github 你的用户名
```

这一条命令会把 `manifest.json` 里的 `author`、`authorUrl` 改掉，并告诉你仓库该叫什么。

带其它选项：

```bash
# 指定作者显示名
python scripts/release.py configure --github 你的用户名 --author "你的名字"

# 加赞助链接
python scripts/release.py configure --github 你的用户名 --funding "https://www.buymeacoffee.com/你的用户名"

# 删掉赞助链接（官方规定 fundingUrl 只用于财务支持，没有就别放）
python scripts/release.py configure --github 你的用户名 --remove-funding
```

---

## 2. 建仓库并推上去

```bash
# 在插件目录里
git init
git add .
git commit -m "SyncMedic 0.1.0"
git branch -M main
git remote add origin https://github.com/你的用户名/obsidian-syncmedic.git
git push -u origin main
```

建仓库时选 **Public**。

仓库根目录必须能看到 `manifest.json`、`main.js`、`styles.css`。

---

## 3. 发 Release

### 方式 A：GitHub Actions（推荐）

```bash
# 改版本号时，先改两处，见第 6 节
npm run build
git add -A && git commit -m "release 0.1.0"
git tag 0.1.0
git push origin main --tags
```

Actions 会自动跑测试 → 构建 → 建 Release，附件名和版本号都对。

### 方式 B：手动

```bash
python scripts/release.py check --tag 0.1.0   # 先自检
python scripts/release.py package             # 生成 dist/
```

然后在 GitHub 上点 **Releases → Draft a new release**：

- **Tag**：`0.1.0`（不要加 v）
- **Title**：`0.1.0`（必须和 tag、manifest 版本一样）
- **附件**：把 `dist/` 里的 `main.js`、`manifest.json`、`styles.css` 传上去
- **描述**：可以用 `CHANGELOG.md` 的内容

装了 `gh` 命令行的话也可以：

```bash
python scripts/release.py release --repo 你的用户名/obsidian-syncmedic
```

---

## 4. 用户怎么装（BRAT 路线）

1. 用户从 Obsidian 官方市场装 **BRAT**（搜 "BRAT"）
2. BRAT 里执行命令 `Plugins: Add a beta plugin for testing`
3. 填仓库地址：`你的用户名/obsidian-syncmedic`
4. 装完启用即可

BRAT 会自己跟踪 Release，以后你发新 tag，用户点一下「检查更新」就能升级。

**不需要**去任何 beta 列表仓库登记——BRAT 的 beta 列表就是一个仓库路径数组，用户可以自己加任意仓库。

---

## 5. 提交官方社区插件市场

审核通过后，用户就能在 Obsidian 里直接搜 "SyncMedic"，一键安装、自动更新。

```bash
python scripts/release.py entry --repo 你的用户名/obsidian-syncmedic
```

会打印出要加到 `community-plugins.json` 里的那一行。然后：

1. Fork `https://github.com/obsidianmd/obsidian-releases`
2. 在 `community-plugins.json` 数组里加上这一行
3. 提 PR，标题写 `Add plugin: SyncMedic`

字段格式是核对过的——官方 10,844 条记录用的字段就是 `id` / `name` / `author` / `description` / `repo` 五个。

BRAT 会自动检测插件是不是已经进了官方市场（它会读 `community-plugins.json`），进市之后可以用 BRAT 的 graduated-plugin 命令把追踪记录清掉。

---

## 6. 改版本号

版本号在**两个地方**，必须一起改：

| 文件 | 字段 |
| --- | --- |
| `manifest.json` | `"version"` |
| `src/settings.ts` | `PLUGIN_VERSION` |

改完跑一次：

```bash
npm test          # manifest 测试会挡住两边不一致的情况
npm run build
```

---

## 7. 自检清单

发版前跑一遍：

```bash
npm test                          # 79 个测试
npm run typecheck
npm run build
python scripts/release.py check --tag 0.1.0
```

`check` 会挡住这些情况：

- manifest 缺字段 / version 不是合法 semver
- id 和插件文件夹名不一致（Obsidian 靠这个对应）
- manifest 版本和 `src/settings.ts` 里的不一致
- tag 和 manifest 版本不一致
- `authorUrl` / `fundingUrl` 不是 https
- 缺构建产物

---

## 8. 官方审核常见退稿点（已自查）

对照 [官方 Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) 逐条核过：

| 审核要求 | 本插件 |
| --- | --- |
| 不用全局 `app`，用 `this.app` | ✅ |
| 不打印多余调试日志 | ✅ 没有 console 输出 |
| 正则不含 lookbehind（iOS 16.4 以下会崩） | ✅ grep 确认零命中 |
| 不用 `innerHTML` | ✅ 全用 `createEl` / `createDiv` |
| 资源在插件卸载时释放 | ✅ 全部用 `this.add*` 注册 |
| 命令用 `callback` / `checkCallback` | ✅ 用 `callback` |
| 优先用 Vault API 而不是 Adapter API | ✅ vault 内文件走 Vault API；只有 `.obsidian/` 走 Adapter API（`.obsidian` 不在 vault 文件索引里，Vault API 看不到） |
| 设置面板标题不要出现 "Settings" | ✅ 没有用标题 |
| 设置项用 Sentence case | ✅ |
