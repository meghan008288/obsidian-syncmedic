#!/usr/bin/env node
/**
 * Fingerprint drift check.
 *
 * Every rule in src/rules.ts matches text that an upstream project prints.
 * When that text changes upstream, the rule silently stops matching and the
 * plugin reports "no known problem" instead of a diagnosis. This script checks
 * every fingerprint against the upstream source (or the upstream issue) it was
 * pinned to in src/rule-anchors.ts and fails when one of them is gone.
 *
 * Usage:
 *   node scripts/check_fingerprints.ts                  # check against upstream
 *   node scripts/check_fingerprints.ts --offline        # use the local _src copies
 *   node scripts/check_fingerprints.ts --local-src DIR  # use another local copy
 *   node scripts/check_fingerprints.ts --report out.md  # also write a markdown report
 *   node scripts/check_fingerprints.ts --proxy http://127.0.0.1:7897
 *   node scripts/check_fingerprints.ts --max-time 10 --retries 0
 *
 * Exit code is 1 when an active anchor drifted, so CI can fail on it, and 2
 * when the upstream projects could not be reached at all, which is a network
 * problem and not a drift.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RULES } from "../src/rules.ts";
import {
  RULE_ANCHORS,
  UPSTREAM_PROJECTS,
  type RuleAnchor,
} from "../src/rule-anchors.ts";
import { fetchText, type HttpResult } from "./http.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const WORKSPACE = resolve(ROOT, "..");

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const option = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

/** Where the offline copies of the upstream repositories live. */
const LOCAL_SRC = resolve(option("local-src") ?? join(WORKSPACE, "_src"));

const OFFLINE = flag("offline");
const PROXY = option("proxy") ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
const REPORT = option("report");
const MAX_TIME = Number(option("max-time") ?? 45);
const RETRIES = Number(option("retries") ?? 2);

function token(): string {
  const env = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (env) return env;
  const candidates = [
    join(
      process.env.LOCALAPPDATA ?? "",
      "Programs",
      "GitHub CLI",
      "bin",
      "gh.exe",
    ),
    "gh",
  ];
  for (const gh of candidates) {
    try {
      const out = execFileSync(gh, ["auth", "token"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const value = out.trim();
      if (value) return value;
    } catch {
      /* try the next one */
    }
  }
  return "";
}

/**
 * Collapse the parts that legitimately differ between two copies of the same
 * message: template holes and number runs. "Request failed, status ${status}"
 * and "Request failed, status 403" then compare equal.
 */
function canonical(text: string): string {
  return text
    .replace(/\$\{[^}]*\}/g, "#")
    .replace(/\d+/g, "#")
    .toLowerCase();
}

function fetchUpstream(url: string, accept = "text/plain"): HttpResult {
  return fetchText(url, {
    proxy: PROXY,
    token: token(),
    accept,
    maxTime: MAX_TIME,
    retries: RETRIES,
  });
}

function fetchJson(url: string): any {
  const res = fetchUpstream(url, "application/vnd.github+json");
  if (!res.ok) return null;
  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

interface Outcome {
  ruleId: string;
  anchor: RuleAnchor;
  state: "ok" | "drift" | "legacy" | "skipped" | "error";
  detail: string;
}

function checkSource(anchor: RuleAnchor): Outcome {
  const project = UPSTREAM_PROJECTS[anchor.project];
  const literal = canonical(anchor.literal);
  let text: string | null = null;
  let where = `${anchor.project}/${anchor.target}`;

  if (OFFLINE) {
    const local = join(LOCAL_SRC, anchor.project, anchor.target);
    if (!existsSync(local)) {
      return { ruleId: "", anchor, state: "skipped", detail: `no local copy at ${local}` };
    }
    text = readFileSync(local, "utf-8");
    where = `local ${anchor.project}/${anchor.target}`;
  } else {
    const url = `https://raw.githubusercontent.com/${project.repo}/${project.branch}/${anchor.target}`;
    const res = fetchUpstream(url);
    if (!res.ok) {
      if (res.status === 404) {
        return {
          ruleId: "",
          anchor,
          state: anchor.status === "legacy" ? "legacy" : "drift",
          detail: `${anchor.target} is no longer in the upstream repository (HTTP 404)`,
        };
      }
      return {
        ruleId: "",
        anchor,
        state: "error",
        detail: `could not read ${url} (HTTP ${res.status || "no answer"})`,
      };
    }
    text = res.body;
  }

  if (canonical(text).includes(literal)) {
    if (anchor.status === "legacy") {
      return {
        ruleId: "",
        anchor,
        state: "legacy",
        detail: `still in ${where}, but the upstream stopped emitting it`,
      };
    }
    return { ruleId: "", anchor, state: "ok", detail: where };
  }
  return {
    ruleId: "",
    anchor,
    state: anchor.status === "legacy" ? "legacy" : "drift",
    detail: `"${anchor.literal}" is no longer in ${where}`,
  };
}

function checkIssue(anchor: RuleAnchor): Outcome {
  const project = UPSTREAM_PROJECTS[anchor.project];
  const literal = canonical(anchor.literal);
  const where = `${project.repo}#${anchor.target}`;

  if (OFFLINE) {
    return { ruleId: "", anchor, state: "skipped", detail: `${where} (offline)` };
  }

  const issueRes = fetchUpstream(
    `https://api.github.com/repos/${project.repo}/issues/${anchor.target}`,
    "application/vnd.github+json",
  );
  if (!issueRes.ok) {
    if (issueRes.status === 404) {
      return {
        ruleId: "",
        anchor,
        state: anchor.status === "legacy" ? "legacy" : "drift",
        detail: `${where} no longer exists upstream (HTTP 404)`,
      };
    }
    return {
      ruleId: "",
      anchor,
      state: "error",
      detail: `could not read ${where} (HTTP ${issueRes.status || "no answer"})`,
    };
  }

  const commentsRes = fetchUpstream(
    `https://api.github.com/repos/${project.repo}/issues/${anchor.target}/comments?per_page=100`,
    "application/vnd.github+json",
  );
  if (!commentsRes.ok) {
    // The quoted text usually sits in a comment. Without the comments a
    // missing fingerprint would look like a drift that never happened.
    return {
      ruleId: "",
      anchor,
      state: "error",
      detail: `could not read the comments of ${where} (HTTP ${commentsRes.status || "no answer"})`,
    };
  }

  const parts: string[] = [];
  try {
    const issue = JSON.parse(issueRes.body);
    parts.push(issue.title ?? "", issue.body ?? "");
  } catch {
    return { ruleId: "", anchor, state: "error", detail: `could not parse ${where}` };
  }
  try {
    const comments = JSON.parse(commentsRes.body);
    for (const c of Array.isArray(comments) ? comments : []) parts.push(c?.body ?? "");
  } catch {
    return {
      ruleId: "",
      anchor,
      state: "error",
      detail: `could not parse the comments of ${where}`,
    };
  }
  const text = parts.join("\n");

  if (canonical(text).includes(literal)) {
    if (anchor.status === "legacy") {
      return {
        ruleId: "",
        anchor,
        state: "legacy",
        detail: `still in ${where}, but the upstream stopped emitting it`,
      };
    }
    return { ruleId: "", anchor, state: "ok", detail: where };
  }
  return {
    ruleId: "",
    anchor,
    state: anchor.status === "legacy" ? "legacy" : "drift",
    detail: `"${anchor.literal}" is no longer in ${where}`,
  };
}

function latestRelease(project: string): string {
  const info = UPSTREAM_PROJECTS[project];
  if (OFFLINE) return `${info.verifiedAt} (offline)`;
  const rel = fetchJson(`https://api.github.com/repos/${info.repo}/releases/latest`);
  if (!rel?.tag_name) return "unknown";
  const date = rel.published_at ? String(rel.published_at).slice(0, 10) : "?";
  return `${rel.tag_name} (${date})`;
}

const outcomes: Outcome[] = [];
for (const rule of RULES) {
  const anchor = RULE_ANCHORS[rule.id];
  if (!anchor) continue;
  const outcome =
    anchor.kind === "source" ? checkSource(anchor) : checkIssue(anchor);
  outcome.ruleId = rule.id;
  outcomes.push(outcome);
}

const ok = outcomes.filter((o) => o.state === "ok");
const drifted = outcomes.filter((o) => o.state === "drift");
const legacy = outcomes.filter((o) => o.state === "legacy");
const errors = outcomes.filter((o) => o.state === "error");
const skipped = outcomes.filter((o) => o.state === "skipped");
// How many fingerprints were actually looked at. Zero means nothing was
// checked, which must not be reported as "nothing is wrong".
const checked = ok.length + legacy.length + drifted.length;

const lines: string[] = [];
lines.push("SyncMedic fingerprint drift check");
lines.push("");
for (const project of Object.keys(UPSTREAM_PROJECTS)) {
  const latest = latestRelease(project);
  const verified = UPSTREAM_PROJECTS[project].verifiedAt;
  const moved = !OFFLINE && latest !== "unknown" && !latest.startsWith(verified);
  lines.push(
    `upstream ${project}: latest ${latest}, anchors verified against ${verified}${moved ? "  <- upstream moved, review the changelog" : ""}`,
  );
}
lines.push("");
for (const o of outcomes) {
  const mark =
    o.state === "ok"
      ? "ok     "
      : o.state === "drift"
        ? "DRIFT  "
        : o.state === "legacy"
          ? "legacy "
          : o.state === "skipped"
            ? "skipped"
            : "error  ";
  lines.push(
    `  ${mark} ${o.ruleId}  ${o.anchor.kind.padEnd(5)}  ${o.detail}`,
  );
}
lines.push("");
lines.push(
  `${ok.length} ok, ${legacy.length} legacy, ${drifted.length} drifted, ${errors.length} unreachable, ${skipped.length} skipped`,
);
// The workflow reads this line to tell a real drift apart from a machine
// that could not reach the upstream projects.
lines.push(
  `RESULT: ${drifted.length > 0 ? "drift" : errors.length > 0 || checked === 0 ? "unverifiable" : "no-drift"}`,
);

const report = lines.join("\n");
console.log(report);

if (REPORT) {
  const path = resolve(REPORT);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, report + "\n", "utf-8");
  console.log(`\nreport written to ${path}`);
}

// 1 means a fingerprint really moved. 2 means the check could not be
// completed. The two must not be mixed up: a network problem is not a drift.
if (drifted.length > 0) process.exit(1);
if (errors.length > 0 || checked === 0) process.exit(2);
