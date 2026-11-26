import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RULES,
  analyzeDocuments,
  type AnalysisDocument,
  type RuleMatch,
} from "../src/rules.ts";

/**
 * Every sample below is either
 *   (a) copied verbatim from an open GitHub issue of the plugin, or
 *   (b) a string literal that the plugin's shipping code really prints.
 *
 * "Really prints" means the text is in the code that runs, not in a line
 * that was commented out. A commented-out console.debug never reaches a
 * user's log, so a rule built on it can never fire.
 */
const CASES: {
  ruleId: string;
  pluginId: string;
  sample: string;
}[] = [
  // ---------------- Remotely Save ----------------
  {
    ruleId: "RS-01",
    pluginId: "remotely-save",
    sample: "app.js:1 Uncaught (in promise) Error: Request failed, status 403",
  },
  {
    ruleId: "RS-01",
    pluginId: "remotely-save",
    sample: "Uncaught (in promise) Error: Access denied",
  },
  {
    ruleId: "RS-02",
    pluginId: "remotely-save",
    sample: "plugin:remotely-save:234 Error: Request failed, status 429",
  },
  {
    ruleId: "RS-03",
    pluginId: "remotely-save",
    sample:
      'Microsoft Graph API limits the conflict behavior for folders: the original plugin used @microsoft.graph.conflictBehavior: "replace" when it created the repository root. Microsoft Graph rejects that outright and returns 400 Bad Request.',
  },
  {
    ruleId: "RS-04",
    pluginId: "remotely-save",
    sample: "Request failed, status 405",
  },
  {
    ruleId: "RS-04",
    pluginId: "remotely-save",
    sample:
      "we fail to write file partially for nextcloud or apache or sabre/dav, stop!",
  },
  {
    ruleId: "RS-05",
    pluginId: "remotely-save",
    sample:
      "Error: Abort! you set changing files >= 50% is not allowed but 270/271=99.6% is going to be modified or deleted! If you are sure you want this sync, please adjust the allowed ratio",
  },
  {
    ruleId: "RS-06",
    pluginId: "remotely-save",
    sample: "plugin:remotely-save:234 Error: net::ERR_NETWORK_IO_SUSPENDED",
  },
  {
    ruleId: "RS-06",
    pluginId: "remotely-save",
    sample: "plugin:remotely-save:234 Error: net::ERR_TIMED_OUT",
  },
  {
    ruleId: "RS-07",
    pluginId: "remotely-save",
    sample: "some error while deleting",
  },
  {
    ruleId: "RS-08",
    pluginId: "remotely-save",
    sample: "trying to delete db but it was blocked",
  },
  {
    ruleId: "RS-09",
    pluginId: "remotely-save",
    sample: "plugin:remotely-save:234 Error: cannot encrypt name=notes/todo.md",
  },
  {
    ruleId: "RS-09",
    pluginId: "remotely-save",
    sample: "Error: cannot encrypt content",
  },
  {
    ruleId: "RS-09",
    pluginId: "remotely-save",
    sample: "Error: unknown outputName after encryptNameByCallingWorker",
  },
  {
    ruleId: "RS-09",
    pluginId: "remotely-save",
    sample: "Error: unknown outputContent after encryptContentByCallingWorker",
  },
  {
    ruleId: "RS-09",
    pluginId: "remotely-save",
    sample: "Error: error after prepareByCallingWorker",
  },
  {
    ruleId: "RS-09",
    pluginId: "remotely-save",
    sample: "Error: cannot decrypt name=notes/todo.md",
  },
  {
    ruleId: "RS-09",
    pluginId: "remotely-save",
    sample: "Error: cannot decrypt content",
  },
  {
    ruleId: "RS-10",
    pluginId: "remotely-save",
    sample:
      "start updating local info of OneDrive token\n" +
      "plugin:remotely-save:216 finish updating local info of Onedrive token\n" +
      "app.js:1 Uncaught (in promise) Error: Request failed, status 403",
  },
  {
    ruleId: "RS-11",
    pluginId: "remotely-save",
    sample: "check connect: delete file",
  },

  // ---------------- Obsidian LiveSync ----------------
  {
    ruleId: "LS-01",
    pluginId: "obsidian-livesync",
    sample: "The preflight fetch failed with a CORS Error",
  },
  {
    ruleId: "LS-02",
    pluginId: "obsidian-livesync",
    sample:
      "Synchronisation has been cancelled with the message (TypeError:Failed to fetch",
  },
  {
    ruleId: "LS-03",
    pluginId: "obsidian-livesync",
    sample:
      "Could not connect to https://[my uri]]: [my db]:SyntaxError:Failed to execute 'json' on 'Response': Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON",
  },
  {
    ruleId: "LS-04",
    pluginId: "obsidian-livesync",
    sample: 'Configuration mismatching between the clients."',
  },
  {
    ruleId: "LS-04",
    pluginId: "obsidian-livesync",
    sample: "I cannot Validate Database Configuration either. Error message: checking configuration failed.",
  },
  {
    ruleId: "LS-05",
    pluginId: "obsidian-livesync",
    sample:
      "10/14/2024, 10:53:06 AM->Exception raised while retrieving chunks\n" +
      "10/14/2024, 10:53:06 AM->Error:Failed: CollectChunksInternal\n" +
      "10/14/2024, 10:53:06 AM->STORAGE Error:File not found on database.:.obsidian/workspace-mobile.json",
  },
  {
    ruleId: "LS-06",
    pluginId: "obsidian-livesync",
    sample: "[Error] Please unlock the database from the Obsidian plugin and retry.",
  },
  {
    ruleId: "LS-07",
    pluginId: "obsidian-livesync",
    sample:
      "01-27 11:44:00.566 E/chromium(30674): [ERROR:ssl_client_socket_impl.cc(980)] handshake failed; returned -1, SSL error code 1, net_error -202",
  },
  {
    ruleId: "LS-08",
    pluginId: "obsidian-livesync",
    sample: "Failed to parse remote configuration",
  },
  {
    ruleId: "LS-09",
    pluginId: "obsidian-livesync",
    sample: "notes/todo.md is conflicted, merging process has been postponed.",
  },
  {
    ruleId: "LS-10",
    pluginId: "obsidian-livesync",
    sample: "Found 12 deleted files.",
  },
  {
    ruleId: "LS-11",
    pluginId: "obsidian-livesync",
    sample: "Error during vault initialisation process.",
  },
];

function doc(pluginId: string, text: string): AnalysisDocument {
  return { pluginId, path: `sample/${pluginId}.log`, text };
}

function analyzeOne(
  pluginId: string,
  text: string
): { result: ReturnType<typeof analyzeDocuments> } {
  return { result: analyzeDocuments([doc(pluginId, text)]) };
}

test("the rule catalogue holds exactly 22 rules", () => {
  assert.equal(RULES.length, 22);
});

test("every rule has a unique id, at least one fix step and at least one issue anchor", () => {
  const ids = new Set<string>();
  for (const rule of RULES) {
    assert.ok(!ids.has(rule.id), `duplicate rule id: ${rule.id}`);
    ids.add(rule.id);
    assert.ok(rule.title.length > 3, `${rule.id} needs a title`);
    assert.ok(rule.fixes.length > 0, `${rule.id} needs fix steps`);
    for (const fix of rule.fixes) {
      assert.ok(fix.trim().length > 8, `${rule.id} has an empty fix step`);
    }
    assert.ok(rule.issues.length > 0, `${rule.id} needs an issue anchor`);
    assert.ok(
      rule.groups.length > 0,
      `${rule.id} needs at least one signature group`
    );
    for (const group of rule.groups) {
      assert.ok(group.length > 0, `${rule.id} has an empty signature group`);
    }
  }
});

test("every rule signature fires on its real-world sample", () => {
  for (const c of CASES) {
    const { result } = analyzeOne(c.pluginId, c.sample);
    const ids = result.matches.map((m) => m.ruleId);
    assert.ok(
      ids.includes(c.ruleId),
      `${c.ruleId} did not fire; got [${ids.join(", ")}] for sample:\n${c.sample}`
    );
  }
});

test("a rule only fires for its own plugin scope", () => {
  const { result } = analyzeOne("obsidian-livesync", "Request failed, status 403");
  const rsHits = result.matches.filter((m) => m.ruleId.startsWith("RS-"));
  assert.equal(rsHits.length, 0, "a LiveSync document must not match RS rules");
});

test("unknown source documents still get matched, because pasted console output has no owner", () => {
  const { result } = analyzeOne("unknown", "Request failed, status 429");
  assert.ok(result.matches.some((m) => m.ruleId === "RS-02"));
});

test("a clean log produces no matches at all", () => {
  const { result } = analyzeOne(
    "remotely-save",
    [
      "2025-11-12T10:23:45.123Z [INFO] OneDrive: GET /me/drive/root/children",
      "2025-11-12T10:23:46.001Z [INFO] upload finished, 12 files",
      "sync finished in 3.2s",
    ].join("\n")
  );
  assert.equal(result.matches.length, 0);
});

test("evidence carries the real 1-based line number and the original text", () => {
  const text = [
    "2025-11-12T10:23:45.123Z [INFO] starting",
    "2025-11-12T10:23:46.001Z [INFO] connecting",
    "plugin:remotely-save:234 Error: Request failed, status 403",
    "2025-11-12T10:23:47.001Z [INFO] done",
  ].join("\n");
  const { result } = analyzeOne("remotely-save", text);
  const match = result.matches.find((m) => m.ruleId === "RS-01");

  assert.ok(match, "RS-01 should have matched");
  assert.equal(match.evidence.length, 1);
  assert.equal(match.evidence[0].line, 3);
  assert.ok(match.evidence[0].text.includes("Request failed, status 403"));
});

test("evidence is capped so a runaway log cannot flood the report", () => {
  const text = Array.from(
    { length: 500 },
    () => "plugin:remotely-save:234 Error: Request failed, status 403"
  ).join("\n");
  const { result } = analyzeOne("remotely-save", text);
  const match = result.matches.find((m) => m.ruleId === "RS-01");

  assert.ok(match);
  assert.ok(match.evidence.length <= 8, "evidence must be capped");
  assert.equal(match.occurrences, 500, "occurrences must count every hit");
});

test("results are ordered by severity, critical first", () => {
  const text = [
    "check connect: delete file",
    "Error: unknown outputName after encryptNameByCallingWorker",
    "plugin:remotely-save:234 Error: Request failed, status 429",
    "plugin:remotely-save:234 Error: Request failed, status 403",
  ].join("\n");
  const { result } = analyzeOne("remotely-save", text);
  const severities = result.matches.map((m) => m.severity);
  const rank = { critical: 0, warning: 1, info: 2 } as const;

  for (let i = 1; i < severities.length; i++) {
    assert.ok(
      rank[severities[i - 1]] <= rank[severities[i]],
      `severity order broken at index ${i}: ${severities.join(",")}`
    );
  }
  assert.equal(result.matches[0].ruleId, "RS-01");
});

test("issue anchors are rendered as resolvable GitHub URLs", () => {
  const { result } = analyzeOne("remotely-save", "Request failed, status 403");
  const match = result.matches.find((m) => m.ruleId === "RS-01");

  assert.ok(match);
  assert.ok(match.issues.length > 0);
  for (const issue of match.issues) {
    assert.match(
      issue.url,
      /^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/,
      `bad issue url: ${issue.url}`
    );
  }
});

test("the same rule hit in two documents is reported once with combined occurrences", () => {
  const documents: AnalysisDocument[] = [
    doc("remotely-save", "Request failed, status 403"),
    doc("remotely-save", "another line\nRequest failed, status 403"),
  ];
  const result = analyzeDocuments(documents);
  const matches = result.matches.filter((m) => m.ruleId === "RS-01");

  assert.equal(matches.length, 1, "one rule must not be reported twice");
  assert.equal(matches[0].occurrences, 2);
  assert.equal(result.matchedDocuments, 2);
  assert.equal(result.scannedDocuments, 2);
});

test("scanned line and document counters are reported", () => {
  const documents: AnalysisDocument[] = [
    doc("remotely-save", "a\nb\nc"),
    doc("obsidian-livesync", "d\ne"),
  ];
  const result = analyzeDocuments(documents);
  assert.equal(result.scannedDocuments, 2);
  assert.equal(result.scannedLines, 5);
});

test("an empty document set is handled without throwing", () => {
  const result = analyzeDocuments([]);
  assert.equal(result.matches.length, 0);
  assert.equal(result.scannedDocuments, 0);
  assert.equal(result.scannedLines, 0);
});

test("every rule id referenced by the sample table exists in the catalogue", () => {
  const known = new Set(RULES.map((r) => r.id));
  for (const c of CASES) {
    assert.ok(known.has(c.ruleId), `unknown rule id in test table: ${c.ruleId}`);
  }
});

test("the catalogue covers both plugins and all three severities", () => {
  const scopes = new Set(RULES.map((r) => r.scope));
  assert.ok(scopes.has("remotely-save"));
  assert.ok(scopes.has("obsidian-livesync"));
  const severities = new Set(RULES.map((r) => r.severity));
  assert.ok(severities.has("critical"));
  assert.ok(severities.has("warning"));
  assert.ok(severities.has("info"));
});

test("matches expose their rule metadata for the report", () => {
  const { result } = analyzeOne("obsidian-livesync", "The preflight fetch failed with a CORS Error");
  const match: RuleMatch | undefined = result.matches.find(
    (m) => m.ruleId === "LS-01"
  );
  assert.ok(match);
  assert.ok(match.title.length > 0);
  assert.ok(match.category.length > 0);
  assert.ok(match.fixes.length > 0);
  assert.ok(["source", "issue"].includes(match.origin));
});
