# 提交到 Obsidian 官方社区目录 —— 操作清单

> 提交入口是 <https://community.obsidian.md>。
> **不是**给 `obsidianmd/obsidian-releases` 提 PR —— 那个仓库的 PR 通道已被官方关闭。

---

## 第 0 步：注册 Obsidian 账号

官方目录用 **Obsidian 账号**（邮箱 + 密码）登录，不是 GitHub 账号。

1. 打开 <https://obsidian.md/account>（或 <https://community.obsidian.md> 右上角 Sign in）
2. 点 **Create an account**
3. 填 Full name / Email / Password，提交
4. 去邮箱点验证链接

> 账号本身不是用 Obsidian App 的必要条件，但**上市场需要**。

---

## 第 1 步：关联 GitHub 账号

1. 登录 <https://community.obsidian.md> 后进入 **Community profile**
2. 侧边栏 **GitHub** 一栏点 **Connect**
3. 跳到 GitHub 授权，确认关联 `meghan008288`
   （只读权限，只用来验证你确实拥有要提交的仓库）

建议顺手打开 **Action required notifications**——审核出问题时会给你发邮件。

---

## 第 2 步：填写 Profile（可选但建议）

| 字段 | 建议填法 |
| --- | --- |
| Username | 小写字母、数字、连字符，例如 `meghan008288` |
| Name | `Meghan` |
| Bio | 最多 500 字符，写你是谁、做什么的 |
| Website | 可留空 |
| Social accounts | 最多 4 个链接 |

---

## 第 3 步：Claim 仓库

关联 GitHub 后会自动出现 **Available to claim**：

1. 勾选 `meghan008288/obsidian-syncmedic`
2. **Claim as** 选 **Myself**
3. 点 **Claim N selected**

Claim 完成后插件会出现在你的 **Plugins** 页面。

---

## 第 4 步：提交插件表单

侧边栏 **Plugins** → **New plugin**。字段已经给你准备好了：

| 表单字段 | 填什么 |
| --- | --- |
| **GitHub repository URL** | `https://github.com/meghan008288/obsidian-syncmedic` |
| **Owner** | 选你自己（Myself） |
| **Screenshot path** | `screenshots/report.png`（见第 5 步） |
| **Supported modes** | 插件没有这个字段（那是主题的） |
| **Description** | 用 `manifest.json` 里那段英文描述（市场页面会自己取） |
| **Categories** | 可选，建议 `Integrations` 或 `Files` |
| **Payment type** | Free（当前版本完全免费、零网络请求） |

然后：同意 **Developer policies** → 确认会持续维护 → **Submit**。

---

## 第 5 步：截图（唯一需要你动手的部分）

要求：

- 最多 5 张桌面图 **1200 × 800**，最多 5 张移动图 **900 × 1600**
- JPEG / PNG / WebP，单张 ≤ 5 MB
- 路径相对仓库根目录，例：`screenshots/report.png`
- **必须是 Obsidian 里真实打开插件后的画面**，目录会扫源码，示意图对不上会变成 error

怎么弄：

1. 把插件装进 Obsidian（见 `RELEASE.md` 的 BRAT 装法）
2. 把 `samples/` 里的任一个文件丢进 vault（`livesync_log_2026-11-24.md` 或 `_debug_remotely_save/log_hist_exported_on_1764000000000.md`），这样能触发全部 22 条规则
3. 命令面板跑 `SyncMedic: 运行同步体检`
4. `Ctrl+Shift+I` 打开开发者控制台，切走再截图
5. 存到 `screenshots/` 目录，建议文件名：
   - `screenshots/report.png` —— 报告弹窗，命中规则、证据行、修复步骤
   - `screenshots/sources.png` —— 报告下半部分，扫了哪些日志来源、哪些没采到
   - `screenshots/settings.png` —— 设置面板

规格和说明见 [`screenshots/README.md`](./screenshots/README.md)。

---

## 第 6 步：审核反馈怎么处理

提交后是**自动审核**，结果分四档：

| 档位 | 影响 |
| --- | --- |
| **error** | 必须修，不修装不上 |
| **warning** | 不阻塞，但建议修 |
| **recommendation** | 建议 |
| **pass** | 通过 |

扫描内容分四组：manifest、release assets、source code、build verification。

**build verification** 是关键：目录会拿你的源码**重新构建一遍**，核对 release 里的 `main.js` 是否一致。本插件用 CI 构建，天然一致。可以本地先验一遍：

```bash
python scripts/verify_release.py
```

它会下载 release 的三个资产，和仓库 HEAD 逐字节比对。

改完问题后，**发一个版本号 +1 的新 Release**（版本号变了才会触发新一轮扫描）：

```bash
# 改 manifest.json 和 src/settings.ts 里的 PLUGIN_VERSION（两处必须一致）
npm test && npm run build
git add -A && git commit -m "release 0.1.1"
git tag 0.1.1 && git push origin main --tags
```

也可以在条目页的 `...` 菜单里点 **Request review** 立刻触发，或用 **Review branch** 先跑一次预扫描。

---

## 本插件对官方政策的自查

| 政策 | 状态 |
| --- | --- |
| 不混淆代码 | ✅ 纯源码，MIT |
| 不插动态广告 / 静态广告 | ✅ |
| **不使用客户端遥测** | ✅ 零网络请求，README 里写明 "Nothing leaves your machine" |
| 不自更新 | ✅ |
| 含 LICENSE | ✅ MIT |
| 尊重 Obsidian 商标 | ✅ 插件名不含 Obsidian |
| plugin id 不含 "obsidian" | ✅ `syncmedic` |
| 网络用途需写进 README | ✅ 明确写了不联网 |
| 非 fork 项目 | ✅ 全新仓库 |
| 正则不含 lookbehind（iOS 16.4 以下会崩） | ✅ grep 确认零命中 |
| 优先 Vault API 而非 Adapter API | ✅ 只有 `.obsidian/` 用 Adapter API |

---

## 常见问题

**Q：提交后多久能上架？**
A：自动审核通常是分钟级到几天不等，取决于队列和是否需要人工复核。

**Q：BRAT 用户和市场用户会冲突吗？**
A：不会。上架后 Obsidian 官方更新器会接管，BRAT 的追踪记录可以用 BRAT 的
graduated-plugin 命令清掉。

**Q：README 需要全英文吗？**
A：不需要。目录页面会摘录展示你的 README，相对链接和图片会自动重写。
本仓库已经在开头加了英文摘要，正文保留中文。

**Q：改了源码但没发新 Release，会怎样？**
A：目录读的是 HEAD 的 `manifest.json` 和 release 里的资产。
改了源码就要发新版本号，否则市场里的版本还是旧的。
