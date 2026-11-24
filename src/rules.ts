/**
 * Rule engine: matches real Obsidian sync-plugin failure signatures and
 * turns them into actionable fixes.
 *
 * Every rule is anchored to something that provably exists:
 *   - `origin: "source"` -> the string is present in the shipping source of
 *     the plugin (verified by reading the repository);
 *   - `origin: "issue"` -> the string was pasted verbatim by a user into an
 *     open GitHub issue.
 * Nothing here is invented from thin air.
 */

export type Severity = "critical" | "warning" | "info";

export type PluginScope = "remotely-save" | "obsidian-livesync" | "any";

export type RuleOrigin = "source" | "issue";

export interface RuleIssue {
  repo: string;
  number: number;
  /**
   * "direct" = the matched string was pasted in this issue;
   * "related" = the issue discusses the same failure mode.
   */
  relation: "direct" | "related";
}

export interface RuleDefinition {
  id: string;
  title: string;
  severity: Severity;
  scope: PluginScope;
  category: string;
  /**
   * Each group is a set of alternatives (OR). ALL groups must produce at
   * least one match (AND across groups). An empty group list means the rule
   * never matches.
   */
  groups: RegExp[][];
  fixes: string[];
  issues: RuleIssue[];
  origin: RuleOrigin;
}

export interface Evidence {
  line: number;
  text: string;
  /** Vault-relative path of the document the line came from. */
  source: string;
}

export interface RuleMatch {
  ruleId: string;
  title: string;
  severity: Severity;
  scope: PluginScope;
  category: string;
  occurrences: number;
  evidence: Evidence[];
  fixes: string[];
  issues: (RuleIssue & { url: string })[];
  origin: RuleOrigin;
}

export interface AnalysisDocument {
  /** Which plugin produced this text. "unknown" for pasted console output. */
  pluginId: string;
  /** Where the text came from, shown in the report. */
  path: string;
  text: string;
}

export interface AnalysisResult {
  matches: RuleMatch[];
  scannedDocuments: number;
  scannedLines: number;
  matchedDocuments: number;
}

const RS = "remotely-save/remotely-save";
const LS = "vrtmrz/obsidian-livesync";

export const RULES: RuleDefinition[] = [
  // ================= Remotely Save =================
  {
    id: "RS-01",
    title: "OneDrive 授权被拒（403）：令牌过期或权限没批下来",
    severity: "critical",
    scope: "remotely-save",
    category: "认证与权限",
    origin: "issue",
    groups: [
      [
        /Request failed, status 403/i,
        /invalidAuthenticationToken/i,
        /unauthenticated_client/i,
        /Access token has expired/i,
        /\bAccess denied\b/i,
      ],
    ],
    fixes: [
      "在 Remotely Save 设置里重新授权 OneDrive：先清掉旧令牌，再点 Sign in 走一遍 OAuth",
      "如果是公司 / 学校 Microsoft 账号，必须让管理员给 remotely-save 应用 admin consent，否则一定 403（issue #11 里 @fyears 的结论）",
      "实在清不干净就直接删 .obsidian/plugins/remotely-save/data.json 里 onedrive 那段令牌字段，再重连",
    ],
    issues: [
      { repo: RS, number: 11, relation: "direct" },
      { repo: RS, number: 920, relation: "direct" },
    ],
  },
  {
    id: "RS-02",
    title: "OneDrive 429 限流：请求发得太急",
    severity: "warning",
    scope: "remotely-save",
    category: "认证与权限",
    origin: "issue",
    groups: [[/Request failed, status 429/i, /Too Many Requests/i]],
    fixes: [
      "把设置里的并发数（degree of parallelism）调低，Graph API 对突发请求限流很敏感",
      "拉长自动同步间隔，别让手动同步和自动同步叠在一起",
      "issue #1121 里有用户反馈 Pro 版会处理 429 并遵守 Retry-After 头，普通版不会",
    ],
    issues: [{ repo: RS, number: 1121, relation: "direct" }],
  },
  {
    id: "RS-03",
    title: "Graph API 400：给文件夹用了 conflictBehavior: replace",
    severity: "critical",
    scope: "remotely-save",
    category: "服务端兼容性",
    origin: "issue",
    groups: [
      [/@microsoft\.graph\.conflictBehavior/i, /400 Bad Request/i],
      [/onedrive/i, /graph/i, /microsoft/i],
    ],
    fixes: [
      "升级 Remotely Save：0.5.25 在较新的 Obsidian 上连 OneDrive 就会报 HTTP 400（issue #1170）",
      "根因是微软 Graph API 不允许对「文件夹」使用 conflictBehavior: replace，文件夹只能用 fail 或 rename",
      "暂时没法升级的话，按 issue #1170 里的做法自行 fork，把 request() 改成 requestUrl()",
    ],
    issues: [{ repo: RS, number: 1170, relation: "direct" }],
  },
  {
    id: "RS-04",
    title: "WebDAV 405 Method Not Allowed：配置目录或特殊文件名写不进去",
    severity: "critical",
    scope: "remotely-save",
    category: "服务端兼容性",
    origin: "source",
    groups: [
      [
        /\b405\b/,
        /Method Not Allowed/i,
        /we fail to write file partially for nextcloud or apache or sabre\/dav/i,
      ],
    ],
    fixes: [
      "先关掉 Remotely Save 设置里的 “Sync Config Dir”（同步配置目录），issue #986 里复现的人都是开了这个才 405",
      "把 .js 扩展名的文件改名——issue #986 实测所有 .js 文件都会触发 405",
      "文件名里带双引号也会触发，把双引号去掉",
      "nextcloud / apache / sabre-dav 对部分写操作直接返回 405，换个服务器或改用 S3",
    ],
    issues: [{ repo: RS, number: 986, relation: "direct" }],
  },
  {
    id: "RS-05",
    title: "变更比例超限，同步被主动中止",
    severity: "critical",
    scope: "remotely-save",
    category: "同步保护机制",
    origin: "issue",
    groups: [
      [/Abort!\s*you set changing files/i],
      [/is going to be modified or deleted/i],
    ],
    fixes: [
      "这是保护机制不是 bug：Remotely Save 发现变更比例超过阈值就中止同步，避免把整库冲掉",
      "按报错里的提示把「允许的最大变更比例」调高，或者先在一个新 vault 上跑一次同步让它建立基线",
      "issue #945 里有人新开一个只有一个文件的 vault 也报 100%，说明阈值判断偏保守，先调阈值再观察",
    ],
    issues: [{ repo: RS, number: 945, relation: "direct" }],
  },
  {
    id: "RS-06",
    title: "网络抖动导致 ERR_NETWORK_IO_SUSPENDED",
    severity: "warning",
    scope: "remotely-save",
    category: "网络",
    origin: "issue",
    groups: [
      [
        /net::ERR_NETWORK_IO_SUSPENDED/i,
        /net::ERR_TIMED_OUT/i,
        /net::ERR_NETWORK_CHANGED/i,
      ],
    ],
    fixes: [
      "这是切网络 / 弱网时的误报，issue #732 的用户反馈并不会真的丢文件",
      "把日志级别从 debug 调回 info：debug 级别会弹带 OK 按钮的提示框，一直打断操作",
      "频繁出现就查一下代理 / VPN，或者缩短同步间隔，别让连接长时间悬挂",
    ],
    issues: [{ repo: RS, number: 732, relation: "direct" }],
  },
  {
    id: "RS-07",
    title: "远端文件删除 / 移动失败",
    severity: "warning",
    scope: "remotely-save",
    category: "同步执行",
    origin: "source",
    groups: [[/some error while deleting/i, /some error while moving/i]],
    fixes: [
      "确认同步方向是双向的，别只勾了「下载」",
      "issue #991 报告删除不生效，多半是远端还留着同名副本，先在远端手动删一次再同步",
      "顺便检查远端存储是不是满了或者没写权限",
    ],
    issues: [{ repo: RS, number: 991, relation: "related" }],
  },
  {
    id: "RS-08",
    title: "本地同步数据库被锁或被删",
    severity: "warning",
    scope: "remotely-save",
    category: "本地状态",
    origin: "source",
    groups: [[/trying to delete db but it was blocked/i, /\bdb deleted\b/i]],
    fixes: [
      "本地数据库被占用了。关掉 Obsidian 再同步一次",
      "如果反复出现，检查 .obsidian/plugins/remotely-save/ 目录的写权限",
      "实在恢复不了可以备份后删掉该目录，让插件重建本地数据库（远端数据不受影响）",
    ],
    issues: [{ repo: RS, number: 1151, relation: "related" }],
  },
  {
    id: "RS-09",
    title: "端到端加密 worker 报错：文件加解密失败",
    severity: "critical",
    scope: "remotely-save",
    category: "端到端加密",
    origin: "source",
    groups: [
      [
        /main: receiving error in prepare/i,
        /main: receiving error in encryptNameByCallingWorker/i,
        /main: receiving error in decryptNameByCallingWorker/i,
        /main: receiving error in encryptContentByCallingWorker/i,
      ],
    ],
    fixes: [
      "加密步骤失败，文件不会上传。先确认「使用端到端加密」和「加密文件名」两个设置是否刚被改过",
      "改过加密设置后，远端旧文件是解不开的，只能用旧密码重新同步一次",
      "issue #1065 的场景就是版本切换后新旧文件互相覆盖，先确认远端跑的是同一套加密参数",
    ],
    issues: [{ repo: RS, number: 1065, relation: "related" }],
  },
  {
    id: "RS-10",
    title: "OneDrive 令牌刷新卡住，连接停在 Connecting to OneDrive",
    severity: "critical",
    scope: "remotely-save",
    category: "认证与权限",
    origin: "issue",
    groups: [
      [
        /Request failed, status 403/i,
        /Access denied/i,
        /invalidAuthenticationToken/i,
        /unauthenticated_client/i,
        /Access token has expired/i,
      ],
      [/updating local info of OneDrive token/i],
    ],
    fixes: [
      "Obsidian 把回调发到 obsidian://remotely-save-cb-onedrive，浏览器那边拦不住就会卡住（issue #920 的复现结论）",
      "换 Chrome 打开授权链接，确认没有拦 cookie 和第三方跳转",
      "Windows 用户还要检查系统默认浏览器是不是 IE 或 Edge 的旧版本",
      "能连通但报错的话，看具体错误码对应 RS-01 / RS-02 / RS-03",
    ],
    issues: [{ repo: RS, number: 920, relation: "direct" }],
  },
  {
    id: "RS-11",
    title: "远端连接自检未通过",
    severity: "info",
    scope: "remotely-save",
    category: "连接自检",
    origin: "source",
    groups: [[/check connect: delete file/i, /check connect: delete folder/i]],
    fixes: [
      "插件在连接时自测了删除文件 / 删除文件夹权限。出现这条说明远端账号权限可能不全",
      "确认远端存储里有一个插件可写的测试目录，并且账号有删除权限",
      "如果远端策略禁止删除，可以把删除类文件放到单独的「忽略列表」里绕开",
    ],
    issues: [{ repo: RS, number: 840, relation: "related" }],
  },

  // ================= Obsidian LiveSync =================
  {
    id: "LS-01",
    title: "CORS 预检失败：服务器没放行 OPTIONS 请求",
    severity: "critical",
    scope: "obsidian-livesync",
    category: "服务器与网络",
    origin: "issue",
    groups: [
      [
        /The preflight fetch failed with a CORS Error/i,
        /No Content available for preflight request/i,
      ],
    ],
    fixes: [
      "CouchDB 默认不开 CORS，issue #588 的结论是要在 CouchDB 配置里加 enable_cors: true",
      "如果前面挂了反向代理，要让它回 Access-Control-Allow-Origin / -Methods / -Headers 三个头",
      "issue #588 还提到「带 query 参数的 URI 会触发 CORS 错误」，先把 URI 里的 ?参数 去掉试试",
      "用 bypass token 的时候也要保证预检请求不带鉴权头",
    ],
    issues: [{ repo: LS, number: 588, relation: "direct" }],
  },
  {
    id: "LS-02",
    title: "同步被取消：TypeError: Failed to fetch",
    severity: "critical",
    scope: "obsidian-livesync",
    category: "服务器与网络",
    origin: "issue",
    groups: [
      [/Synchronisation has been cancelled with the message/i],
      [/TypeError:\s*Failed to fetch/i],
    ],
    fixes: [
      "LiveSync 自己的报错原话就是「这不是服务器的问题，是客户端没发出去」，先查本地网络",
      "常见原因：手机切后台断了网络、公司代理拦截、CouchDB 地址填错协议（http/https）",
      "手机端连不上优先看 LS-07（SSL）",
      "issue #588 里的用户最后是通过反向代理 + bypass token 才连上的",
    ],
    issues: [{ repo: LS, number: 588, relation: "direct" }],
  },
  {
    id: "LS-03",
    title: "服务器返回的不是 JSON（多半返回了登录页）",
    severity: "critical",
    scope: "obsidian-livesync",
    category: "服务器与网络",
    origin: "issue",
    groups: [[/Unexpected token '</i, /is not valid JSON/i], [/DOCTYPE/i]],
    fixes: [
      "服务器回了 HTML 而不是 CouchDB 的 JSON，通常是被反向代理的登录页拦住了",
      "直接用浏览器打开你的 CouchDB 地址，看是不是返回登录页面",
      "如果用了 Platform SSO / Header 认证，先把认证关掉测一次连通性",
      "issue #588 里 Pangolin + Traefik 的组合就是这个问题：认证没配对，响应被替换成了 SSO 页面",
    ],
    issues: [{ repo: LS, number: 588, relation: "direct" }],
  },
  {
    id: "LS-04",
    title: "客户端配置不一致",
    severity: "warning",
    scope: "obsidian-livesync",
    category: "配置",
    origin: "issue",
    groups: [
      [
        /Configuration mismatching between the clients/i,
        /checking configuration failed/i,
      ],
    ],
    fixes: [
      "issue #606 里最有效的解法：设置里打开 Remote Configuration → Fetch Settings → Fetch → Use remote configuration，用服务器上的那份配置覆盖本地",
      "Doctor 面板会直接告诉你哪一项对不上（issue #606 里有 Current value / Ideal value 的例子）",
      "常见触发：升级 LiveSync 版本后默认选项变了，比如 “Compute revisions for chunks”",
      "所有设备都同步到同一份配置后再继续，别在一台机器上单独改",
    ],
    issues: [{ repo: LS, number: 606, relation: "direct" }],
  },
  {
    id: "LS-05",
    title: "chunk 收集失败：文件在数据库里找不到",
    severity: "critical",
    scope: "obsidian-livesync",
    category: "数据库完整性",
    origin: "issue",
    groups: [
      [/Exception raised while retrieving chunks/i, /CollectChunksInternal/i],
      [/File not found on database/i],
    ],
    fixes: [
      "chunk 收集在本地数据库和远端之间对不上，文件被判定为「本地有、远端没有」",
      "先在 LiveSync 设置里跑一次 Rebuild database",
      "还是不行就用 “Fix database” / “Reconstruct database” 重建一次索引",
      "issue #505 里 .obsidian/workspace-mobile.json 这类隐藏文件最容易踩坑，可以先把隐藏文件同步关掉",
    ],
    issues: [{ repo: LS, number: 505, relation: "direct" }],
  },
  {
    id: "LS-06",
    title: "数据库未解锁",
    severity: "critical",
    scope: "obsidian-livesync",
    category: "数据库锁定",
    origin: "source",
    groups: [
      [/Please unlock the database from the Obsidian plugin and retry/i],
    ],
    fixes: [
      "命令行 / headless 模式下，数据库还没被 Obsidian 端解锁，远端请求拿不到密码",
      "先在 Obsidian 桌面端打开 LiveSync 并完成解锁，再跑 headless 客户端",
      "issue #815 就是这个场景：headless client 必须先有桌面端解锁过",
    ],
    issues: [{ repo: LS, number: 815, relation: "direct" }],
  },
  {
    id: "LS-07",
    title: "Android 端 SSL 握手失败",
    severity: "critical",
    scope: "obsidian-livesync",
    category: "TLS/SSL",
    origin: "issue",
    groups: [[/handshake failed/i], [/SSL error code/i, /net_error/i]],
    fixes: [
      "issue #37 里的用户最终换成 Let's Encrypt 证书才解决，NameCheap SSL 在 Android 上握手失败",
      "Android 系统信任的 CA 链比桌面端窄，自签名证书基本不行",
      "检查证书链是否完整（server + intermediate），只发 leaf 证书会失败",
      "用 USB 调试抓 logcat 可以看到完整错误，issue #37 里有具体命令",
    ],
    issues: [{ repo: LS, number: 37, relation: "direct" }],
  },
  {
    id: "LS-08",
    title: "远端配置解析或导入失败",
    severity: "warning",
    scope: "obsidian-livesync",
    category: "配置",
    origin: "source",
    groups: [
      [
        /Failed to parse remote configuration/i,
        /Failed to import remote configuration/i,
        /Failed to activate remote configuration/i,
      ],
    ],
    fixes: [
      "服务器上那份共享配置读不出来。先确认远端配置文件的 JSON 格式没坏",
      "多设备共用配置时，先在一台设备上重新 Fetch + Use remote configuration 覆盖一遍",
      "然后按 LS-04 的办法把所有设备对齐到同一份配置",
    ],
    issues: [{ repo: LS, number: 606, relation: "related" }],
  },
  {
    id: "LS-09",
    title: "文件冲突未解决，需要手动合并",
    severity: "warning",
    scope: "obsidian-livesync",
    category: "冲突与删除",
    origin: "source",
    groups: [
      [
        /is conflicted, merging process has been postponed/i,
        /Manual merge required/i,
        /some conflicts are left in/i,
        /conflict\(s\) found:/i,
      ],
    ],
    fixes: [
      "同一份笔记在两台设备上被同时改过，LiveSync 不会自动覆盖，先手动合并",
      "在 LiveSync 的 Log / 面板里打开冲突列表逐个处理",
      "合并后记得把 revision 删干净，否则下次又会提示（issue #151 说的就是删不掉 revision）",
      "issue #813 里一个「很小」的冲突最终造成了很大的影响，值得优先处理",
    ],
    issues: [
      { repo: LS, number: 151, relation: "related" },
      { repo: LS, number: 813, relation: "related" },
    ],
  },
  {
    id: "LS-10",
    title: "数据库里存在已删除文件，可能被重新拉回来",
    severity: "warning",
    scope: "obsidian-livesync",
    category: "冲突与删除",
    origin: "source",
    groups: [[/Found \d+ deleted files/i, /Searching for deleted files/i]],
    fixes: [
      "删除操作在数据库里留下了标记但没有真正清掉，文件有概率被重新同步回来",
      "issue #151 报告文件「永远删不掉」，issue #813 报告文件被丢进回收站——先检查回收站和 LiveSync 的 trash 设置",
      "跑一次 “Fix database” 或重建索引，把删除标记和实际文件对齐",
      "在设置里把 “Delete trash of local files” 这类选项对照一下，别让回收站拦截删除",
    ],
    issues: [
      { repo: LS, number: 151, relation: "direct" },
      { repo: LS, number: 813, relation: "related" },
    ],
  },
  {
    id: "LS-11",
    title: "重建或初始化被中断",
    severity: "critical",
    scope: "obsidian-livesync",
    category: "重建与初始化",
    origin: "source",
    groups: [
      [
        /Error during vault initialisation/i,
        /Rebuild everything cancelled by user/i,
        /Unprocessed \(Invalid path\)/i,
      ],
    ],
    fixes: [
      "重建流程被打断了，数据库处于半成品状态",
      "先确认网络通畅、远端可连（看 LS-01 / LS-02 / LS-03），再重新跑一次 Rebuild",
      "「Unprocessed (Invalid path)」说明路径里有非法字符，检查笔记名和目录名",
      "issue #762 提到数据库会一路膨胀到 2GB 以上，重建后记得观察体积",
    ],
    issues: [{ repo: LS, number: 762, relation: "related" }],
  },
];

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const DEFAULT_MAX_EVIDENCE = 8;

function appliesTo(rule: RuleDefinition, pluginId: string): boolean {
  if (rule.scope === "any") return true;
  // Pasted console output has no owner, so try every rule against it.
  if (pluginId === "unknown" || pluginId === "") return true;
  return rule.scope === pluginId;
}

function issueUrl(repo: string, number: number): string {
  return `https://github.com/${repo}/issues/${number}`;
}

export function analyzeDocuments(
  documents: AnalysisDocument[],
  options?: { maxEvidence?: number }
): AnalysisResult {
  const maxEvidence = options?.maxEvidence ?? DEFAULT_MAX_EVIDENCE;

  const accumulator = new Map<
    string,
    {
      rule: RuleDefinition;
      occurrences: number;
      evidence: Evidence[];
    }
  >();

  let scannedDocuments = 0;
  let scannedLines = 0;
  let matchedDocuments = 0;

  for (const document of documents) {
    scannedDocuments += 1;
    const lines = document.text.split(/\r?\n/);
    scannedLines += lines.length;

    let documentMatched = false;

    for (const rule of RULES) {
      if (!appliesTo(rule, document.pluginId)) continue;

      const groupHits: number[][] = [];
      for (const group of rule.groups) {
        const hits: number[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (group.some((pattern) => pattern.test(lines[i]))) {
            hits.push(i);
          }
        }
        groupHits.push(hits);
      }

      // Every group must produce at least one hit.
      if (groupHits.some((hits) => hits.length === 0)) continue;

      const allHitLines = Array.from(new Set(groupHits.flat())).sort((a, b) => a - b);
      if (allHitLines.length === 0) continue;

      documentMatched = true;
      const entry = accumulator.get(rule.id) ?? {
        rule,
        occurrences: 0,
        evidence: [],
      };
      // Occurrences count the primary signature only: the extra groups are
      // context requirements, not extra hits.
      entry.occurrences += groupHits[0].length;
      for (const index of allHitLines) {
        if (entry.evidence.length >= maxEvidence) break;
        entry.evidence.push({
          line: index + 1,
          text: lines[index],
          source: document.path,
        });
      }
      accumulator.set(rule.id, entry);
    }

    if (documentMatched) matchedDocuments += 1;
  }

  const matches: RuleMatch[] = Array.from(accumulator.values()).map((entry) => ({
    ruleId: entry.rule.id,
    title: entry.rule.title,
    severity: entry.rule.severity,
    scope: entry.rule.scope,
    category: entry.rule.category,
    occurrences: entry.occurrences,
    evidence: entry.evidence,
    fixes: entry.rule.fixes,
    issues: entry.rule.issues.map((issue) => ({
      ...issue,
      url: issueUrl(issue.repo, issue.number),
    })),
    origin: entry.rule.origin,
  }));

  matches.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return 0; // stable sort keeps the catalogue order inside a severity band
  });

  return {
    matches,
    scannedDocuments,
    scannedLines,
    matchedDocuments,
  };
}
