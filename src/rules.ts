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
    title: "OneDrive authorization refused (403)",
    severity: "critical",
    scope: "remotely-save",
    category: "Authentication and permissions",
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
      "Re-authorize OneDrive in the Remotely Save settings: clear the old token first, then click Sign in and walk through OAuth again",
      "For a company or school Microsoft account an admin has to grant the remotely-save app admin consent, otherwise it is always a 403 (that is the conclusion @fyears reached in issue #11)",
      "If the token cannot be cleared, delete the onedrive token field from data.json in the Remotely Save plugin folder and reconnect",
    ],
    issues: [
      { repo: RS, number: 11, relation: "direct" },
      { repo: RS, number: 920, relation: "related" },
    ],
  },
  {
    id: "RS-02",
    title: "OneDrive 429 rate limited",
    severity: "warning",
    scope: "remotely-save",
    category: "Authentication and permissions",
    origin: "issue",
    groups: [[/Request failed, status 429/i, /Too Many Requests/i]],
    fixes: [
      "Lower the degree of parallelism in the settings, the Graph API is very sensitive to bursts",
      "Increase the automatic sync interval so a manual sync never overlaps an automatic one",
      "In issue #1121 a user reported that the Pro version handles 429 and honours the Retry-After header while the free version does not",
    ],
    issues: [{ repo: RS, number: 1121, relation: "direct" }],
  },
  {
    id: "RS-03",
    title: "Graph API 400 on a folder conflictBehavior",
    severity: "critical",
    scope: "remotely-save",
    category: "Server compatibility",
    origin: "issue",
    groups: [
      [/@microsoft\.graph\.conflictBehavior/i, /400 Bad Request/i],
      [/onedrive/i, /graph/i, /microsoft/i],
    ],
    fixes: [
      "Upgrade Remotely Save: 0.5.25 reports HTTP 400 when connecting to OneDrive on a newer Obsidian (issue #1170)",
      "The root cause is that the Microsoft Graph API does not allow conflictBehavior: replace on a folder, a folder can only use fail or rename",
      "If you cannot upgrade yet, fork it as described in issue #1170 and change request() to requestUrl()",
    ],
    issues: [{ repo: RS, number: 1170, relation: "direct" }],
  },
  {
    id: "RS-04",
    title: "WebDAV 405 Method Not Allowed",
    severity: "critical",
    scope: "remotely-save",
    category: "Server compatibility",
    origin: "source",
    groups: [
      [
        /\b405\b/,
        /Method Not Allowed/i,
        /we fail to write file partially for nextcloud or apache or sabre\/dav/i,
      ],
    ],
    fixes: [
      "Turn off “Sync Config Dir” in the Remotely Save settings first, everyone who reproduced this in issue #986 only got the 405 with it enabled",
      "Rename files with a .js extension, issue #986 measured that every .js file triggers the 405",
      "Double quotes in the file name trigger it too, remove them",
      "nextcloud / apache / sabre-dav return 405 for some write operations, use a different server or switch to S3",
    ],
    issues: [{ repo: RS, number: 986, relation: "direct" }],
  },
  {
    id: "RS-05",
    title: "Change ratio limit exceeded, sync aborted",
    severity: "critical",
    scope: "remotely-save",
    category: "Sync safety mechanism",
    origin: "issue",
    groups: [
      [/Abort!\s*you set changing files/i],
      [/is going to be modified or deleted/i],
    ],
    fixes: [
      "This is a safety mechanism, not a bug: Remotely Save aborts the sync when the change ratio passes the threshold so it cannot overwrite the whole vault",
      "Raise the allowed maximum change ratio as the error suggests, or run one sync in a fresh vault so it can establish a baseline",
      "In issue #945 someone hit 100% on a brand new vault with a single file, which shows the threshold check is conservative. Adjust it first and then watch",
    ],
    issues: [{ repo: RS, number: 945, relation: "direct" }],
  },
  {
    id: "RS-06",
    title: "ERR_NETWORK_IO_SUSPENDED after a network switch",
    severity: "warning",
    scope: "remotely-save",
    category: "Network",
    origin: "issue",
    groups: [
      [
        /net::ERR_NETWORK_IO_SUSPENDED/i,
        /net::ERR_TIMED_OUT/i,
        /net::ERR_NETWORK_CHANGED/i,
      ],
    ],
    fixes: [
      "This is a false positive when the network switches or is weak, users in issue #732 reported that no files are actually lost",
      "Set the log level back from debug to info, debug pops up a modal with an OK button and keeps interrupting you",
      "If it shows up often, check the proxy or VPN, or shorten the sync interval so connections do not hang",
    ],
    issues: [{ repo: RS, number: 732, relation: "direct" }],
  },
  {
    id: "RS-07",
    title: "Remote file delete or move failed",
    severity: "warning",
    scope: "remotely-save",
    category: "Sync execution",
    origin: "source",
    groups: [[/some error while deleting/i, /some error while moving/i]],
    fixes: [
      "Check that the sync direction is two-way and that only “download” is ticked",
      "Issue #991 reported that the deletion did not take effect, most likely because a copy with the same name is still on the remote. Delete it there once, then sync",
      "Also check whether the remote storage is full or not writable",
    ],
    issues: [{ repo: RS, number: 991, relation: "related" }],
  },
  {
    id: "RS-08",
    title: "Local sync database locked or deleted",
    severity: "warning",
    scope: "remotely-save",
    category: "Local state",
    origin: "source",
    groups: [[/trying to delete db but it was blocked/i, /\bdb deleted\b/i]],
    fixes: [
      "The local database is in use. Close Obsidian and sync again",
      "If it keeps happening, check the write permissions of the Remotely Save plugin folder",
      "If it cannot be recovered, back it up and delete the folder so the plugin can rebuild the local database (the remote data is not affected)",
    ],
    issues: [{ repo: RS, number: 1151, relation: "related" }],
  },
  {
    id: "RS-09",
    title: "End-to-end encryption worker failed",
    severity: "critical",
    scope: "remotely-save",
    category: "End-to-end encryption",
    origin: "source",
    // Every one of these is text the upstream 0.5.25 release really prints.
    // The first four are thrown by src/fsEncrypt.ts, the last three are the
    // rejections of the encryption worker in src/encryptRClone.ts.
    groups: [
      [
        /cannot encrypt name=/i,
        /cannot encrypt content/i,
        /cannot decrypt name=/i,
        /cannot decrypt content/i,
        /unknown outputName after encryptNameByCallingWorker/i,
        /unknown outputContent after encryptContentByCallingWorker/i,
        /error after prepareByCallingWorker/i,
      ],
    ],
    fixes: [
      "The encryption step failed, so the file was not uploaded. Check whether the password or the encryption method was just changed",
      "If files were synced before the password was set, they have to be synced again: back up the vault, empty the synced folder in the cloud, then sync once more with the password set (upstream issue #843)",
      "Make sure the remote side uses the same encryption parameters as the local side, otherwise the file names cannot be encrypted or decrypted",
    ],
    issues: [{ repo: RS, number: 843, relation: "related" }],
  },
  {
    id: "RS-10",
    title: "OneDrive token refresh hangs",
    severity: "critical",
    scope: "remotely-save",
    category: "Authentication and permissions",
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
      "Obsidian sends the callback to obsidian://remotely-save-cb-onedrive, and if the browser blocks it the flow hangs (the conclusion from the reproduction in issue #920)",
      "Open the authorization link in Chrome and make sure it does not block cookies or third-party redirects",
      "Windows users should also check whether the default browser is Internet Explorer or an old Edge",
      "If it connects but still errors, look up the exact error code in RS-01 / RS-02 / RS-03",
    ],
    issues: [
      { repo: RS, number: 11, relation: "direct" },
      { repo: RS, number: 920, relation: "related" },
    ],
  },
  {
    id: "RS-11",
    title: "Remote connection self-check failed",
    severity: "info",
    scope: "remotely-save",
    category: "Connection self-check",
    origin: "source",
    groups: [[/check connect: delete file/i, /check connect: delete folder/i]],
    fixes: [
      "The plugin tests delete file and delete folder permissions while connecting. Seeing this means the remote account may not have full permissions",
      "Make sure the remote storage has a test folder the plugin can write to and that the account can delete",
      "If the remote policy forbids deletions, put delete-prone files into a separate “ignore list” to work around it",
    ],
    issues: [{ repo: RS, number: 840, relation: "related" }],
  },

  // ================= Obsidian LiveSync =================
  {
    id: "LS-01",
    title: "CORS preflight failed, OPTIONS not allowed",
    severity: "critical",
    scope: "obsidian-livesync",
    category: "Server and network",
    origin: "issue",
    groups: [
      [
        /The preflight fetch failed with a CORS Error/i,
        /No Content available for preflight request/i,
      ],
    ],
    fixes: [
      "CouchDB does not enable CORS by default, the conclusion in issue #588 is to add enable_cors: true to the CouchDB configuration",
      "If there is a reverse proxy in front, it has to send back the Access-Control-Allow-Origin / -Methods / -Headers headers",
      "Issue #588 also mentions that a URI with query parameters triggers a CORS error, try removing the ?parameters from the URI first",
      "When using a bypass token, make sure the preflight request carries no authorization header",
    ],
    issues: [{ repo: LS, number: 588, relation: "direct" }],
  },
  {
    id: "LS-02",
    title: "Sync cancelled: TypeError: Failed to fetch",
    severity: "critical",
    scope: "obsidian-livesync",
    category: "Server and network",
    origin: "issue",
    groups: [
      [/Synchronisation has been cancelled with the message/i],
      [/TypeError:\s*Failed to fetch/i],
    ],
    fixes: [
      "LiveSync's own wording is “this is not a server problem, the client never sent it”, so check the local network first",
      "Common causes: the phone dropped the network when backgrounded, the company proxy intercepted it, or the CouchDB URL uses the wrong scheme (http/https)",
      "On mobile, check LS-07 (SSL) first",
      "The user in issue #588 only got connected with a reverse proxy plus a bypass token",
    ],
    issues: [{ repo: LS, number: 588, relation: "direct" }],
  },
  {
    id: "LS-03",
    title: "Server did not return JSON",
    severity: "critical",
    scope: "obsidian-livesync",
    category: "Server and network",
    origin: "issue",
    groups: [[/Unexpected token '</i, /is not valid JSON/i], [/DOCTYPE/i]],
    fixes: [
      "The server returned HTML instead of CouchDB's JSON, which usually means a reverse proxy login page intercepted the request",
      "Open your CouchDB address in a browser and check whether you get a login page",
      "If you use Platform SSO or header authentication, turn the authentication off and test the connectivity once",
      "The Pangolin plus Traefik combination in issue #588 is exactly this: the authentication did not match and the response was replaced by an SSO page",
    ],
    issues: [{ repo: LS, number: 588, relation: "direct" }],
  },
  {
    id: "LS-04",
    title: "Client configurations do not match",
    severity: "warning",
    scope: "obsidian-livesync",
    category: "Configuration",
    origin: "issue",
    groups: [
      [
        /Configuration mismatching between the clients/i,
        /checking configuration failed/i,
      ],
    ],
    fixes: [
      "The fix that worked in issue #606: in the settings open Remote Configuration → Fetch Settings → Fetch → Use remote configuration to overwrite the local copy with the one on the server",
      "The Doctor panel tells you exactly which item differs (issue #606 has a Current value / Ideal value example)",
      "Common trigger: the defaults changed after a LiveSync upgrade, for example “Compute revisions for chunks”",
      "Get every device onto the same configuration before continuing, do not change it on a single machine",
    ],
    issues: [{ repo: LS, number: 606, relation: "direct" }],
  },
  {
    id: "LS-05",
    title: "Chunk collection failed, file not in the database",
    severity: "critical",
    scope: "obsidian-livesync",
    category: "Database integrity",
    origin: "issue",
    groups: [
      [/Exception raised while retrieving chunks/i, /CollectChunksInternal/i],
      [/File not found on database/i],
    ],
    fixes: [
      "The chunk collection does not match between the local database and the remote, so the file is judged as “present locally, missing remotely”",
      "Run Rebuild database once in the LiveSync settings first",
      "If that does not work, rebuild the index with “Fix database” / “Reconstruct database”",
      "Hidden files such as the workspace state are the most likely to hit this in issue #505, you can turn off hidden file syncing first",
    ],
    issues: [{ repo: LS, number: 505, relation: "direct" }],
  },
  {
    id: "LS-06",
    title: "Database is not unlocked",
    severity: "critical",
    scope: "obsidian-livesync",
    category: "Database locked",
    origin: "source",
    groups: [
      [/Please unlock the database from the Obsidian plugin and retry/i],
    ],
    fixes: [
      "In command line / headless mode the database has not been unlocked on the Obsidian side, so the remote request cannot get the password",
      "Open LiveSync in the Obsidian desktop app and complete the unlock first, then run the headless client",
      "Issue #815 is exactly this scenario: the headless client needs a prior unlock from the desktop app",
    ],
    issues: [{ repo: LS, number: 815, relation: "direct" }],
  },
  {
    id: "LS-07",
    title: "SSL handshake fails on Android",
    severity: "critical",
    scope: "obsidian-livesync",
    category: "TLS/SSL",
    origin: "issue",
    groups: [[/handshake failed/i], [/SSL error code/i, /net_error/i]],
    fixes: [
      "The user in issue #37 only solved it with a Let's Encrypt certificate, the NameCheap SSL certificate fails the handshake on Android",
      "Android trusts a narrower CA chain than the desktop, self-signed certificates basically do not work",
      "Check that the certificate chain is complete (server + intermediate), sending only the leaf certificate fails",
      "Grabbing logcat over USB debugging shows the full error, issue #37 has the exact command",
    ],
    issues: [{ repo: LS, number: 37, relation: "direct" }],
  },
  {
    id: "LS-08",
    title: "Remote configuration could not be parsed",
    severity: "warning",
    scope: "obsidian-livesync",
    category: "Configuration",
    origin: "source",
    groups: [
      [
        /Failed to parse remote configuration/i,
        /Failed to import remote configuration/i,
        /Failed to activate remote configuration/i,
      ],
    ],
    fixes: [
      "The shared configuration on the server cannot be read. First check that the JSON of the remote configuration file is not broken",
      "When several devices share the configuration, run Fetch + Use remote configuration on one device first to overwrite it",
      "Then align every device to the same configuration the way LS-04 describes",
    ],
    issues: [{ repo: LS, number: 606, relation: "related" }],
  },
  {
    id: "LS-09",
    title: "File conflict needs a manual merge",
    severity: "warning",
    scope: "obsidian-livesync",
    category: "Conflicts and deletions",
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
      "The same note was changed on two devices at once, LiveSync will not overwrite automatically, merge it by hand first",
      "Open the conflict list in the LiveSync log or panel and work through them one by one",
      "After merging, delete the revisions properly, otherwise it comes back (issue #151 is about revisions that cannot be deleted)",
      "In issue #813 a “small” conflict ended up causing a large impact, it is worth handling first",
    ],
    issues: [
      { repo: LS, number: 151, relation: "related" },
      { repo: LS, number: 813, relation: "related" },
    ],
  },
  {
    id: "LS-10",
    title: "Deleted files still in the database",
    severity: "warning",
    scope: "obsidian-livesync",
    category: "Conflicts and deletions",
    origin: "source",
    groups: [[/Found \d+ deleted files/i, /Searching for deleted files/i]],
    fixes: [
      "The deletion left a marker in the database but did not actually remove it, so the file can be synced back",
      "Issue #151 reported files that “never get deleted” and issue #813 reported files landing in the trash, check the trash and the LiveSync trash settings first",
      "Run “Fix database” or rebuild the index so the deletion markers match the actual files",
      "Compare options like “Delete trash of local files” in the settings so the trash does not block the deletion",
    ],
    issues: [
      { repo: LS, number: 151, relation: "direct" },
      { repo: LS, number: 813, relation: "related" },
    ],
  },
  {
    id: "LS-11",
    title: "Rebuild or initialization interrupted",
    severity: "critical",
    scope: "obsidian-livesync",
    category: "Rebuild and initialization",
    origin: "source",
    groups: [
      [
        /Error during vault initialisation/i,
        /Rebuild everything cancelled by user/i,
        /Unprocessed \(Invalid path\)/i,
      ],
    ],
    fixes: [
      "The rebuild was interrupted and the database is in a half-finished state",
      "First check that the network is fine and the remote is reachable (see LS-01 / LS-02 / LS-03), then run Rebuild again",
      "“Unprocessed (Invalid path)” means the path contains invalid characters, check the note and folder names",
      "Issue #762 mentions the database growing past 2GB, watch its size after a rebuild",
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
