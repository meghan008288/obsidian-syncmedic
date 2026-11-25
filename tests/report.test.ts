import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeDocuments } from "../src/rules.ts";
import {
  renderJsonReport,
  renderMarkdownReport,
  renderSummary,
} from "../src/report.ts";

const DOC = {
  pluginId: "remotely-save",
  path: "livesync_log_test.md",
  text: [
    "2026-01-01T00:00:00Z [INFO] starting",
    "plugin:remotely-save:234 Error: Request failed, status 403 " +
      "(Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.secretpayload)",
  ].join("\n"),
};

test("the markdown report names every matched rule", () => {
  const analysis = analyzeDocuments([DOC]);
  const md = renderMarkdownReport({ analysis });

  assert.ok(md.includes("OneDrive authorization refused"), "rule title must appear");
  assert.ok(md.includes("RS-01"), "rule id must appear");
});

test("the markdown report shows the evidence with its line number", () => {
  const analysis = analyzeDocuments([DOC]);
  const md = renderMarkdownReport({ analysis });

  assert.ok(md.includes("Request failed, status 403"));
  assert.ok(md.includes("L2"), "the evidence line number must be shown");
});

test("the markdown report lists the fix steps and the upstream issue links", () => {
  const analysis = analyzeDocuments([DOC]);
  const md = renderMarkdownReport({ analysis });

  assert.ok(md.includes("Re-authorize OneDrive"), "fix steps must appear");
  assert.match(
    md,
    /https:\/\/github\.com\/remotely-save\/remotely-save\/issues\/11/,
    "the issue link must be a real URL"
  );
});

test("the markdown report never leaks a secret, even if evidence still holds one", () => {
  const analysis = analyzeDocuments([DOC]);
  const md = renderMarkdownReport({ analysis });

  assert.ok(
    !md.includes("eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.secretpayload"),
    "the bearer token must not appear in the report"
  );
  assert.ok(md.includes("[REDACTED:bearer-token]"));
});

test("the markdown report says so when nothing matched", () => {
  const analysis = analyzeDocuments([
    { pluginId: "remotely-save", path: "a.log", text: "all good" },
  ]);
  const md = renderMarkdownReport({ analysis });

  assert.ok(md.includes("No known failure signature"), "an empty result must be stated plainly");
  assert.ok(md.includes("2"), "the scanned line count must be reported");
});

test("the markdown report lists the sources that were searched but came up empty", () => {
  const analysis = analyzeDocuments([]);
  const md = renderMarkdownReport({
    analysis,
    collection: {
      documents: [],
      errors: [],
      sources: [
        {
          id: "livesync-log",
          label: "LiveSync log file",
          pluginId: "obsidian-livesync",
          found: 0,
          hint: "Turn on Write logs into the file in the settings",
        },
      ],
    },
  });

  assert.ok(md.includes("LiveSync log file"));
  assert.ok(md.includes("Write logs into the file"), "the hint must be actionable");
});

test("the markdown report surfaces collection errors", () => {
  const analysis = analyzeDocuments([]);
  const md = renderMarkdownReport({
    analysis,
    collection: {
      documents: [],
      sources: [],
      errors: ["cannot read the directory _debug_remotely_save/ (ENOENT)"],
    },
  });

  assert.ok(md.includes("ENOENT"));
});

test("the summary is one line that states the worst severity", () => {
  const analysis = analyzeDocuments([DOC]);
  const summary = renderSummary({ analysis });

  assert.ok(summary.length < 120, "the summary must stay short");
  assert.ok(/critical/i.test(summary), "a critical finding must be called out");
  assert.ok(summary.includes("RS-01"));
});

test("the summary reports a clean run without alarming the user", () => {
  const analysis = analyzeDocuments([
    { pluginId: "remotely-save", path: "a.log", text: "all good" },
  ]);
  const summary = renderSummary({ analysis });

  assert.ok(summary.includes("no known failure signature"));
  assert.ok(!/critical/i.test(summary));
});

test("the json report is valid json and carries the matches and the fixes", () => {
  const analysis = analyzeDocuments([DOC]);
  const json = renderJsonReport({ analysis, pluginVersion: "0.1.0" });
  const parsed = JSON.parse(json);

  assert.equal(parsed.pluginVersion, "0.1.0");
  assert.equal(parsed.matches.length, analysis.matches.length);
  assert.ok(parsed.matches[0].ruleId);
  assert.ok(parsed.matches[0].fixes.length > 0);
  assert.ok(parsed.matches[0].issues[0].url.startsWith("https://github.com/"));
});

test("the json report is also free of secrets", () => {
  const analysis = analyzeDocuments([DOC]);
  const json = renderJsonReport({ analysis });

  assert.ok(!json.includes("eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.secretpayload"));
});

test("the report counts how many redactions were applied", () => {
  const analysis = analyzeDocuments([DOC]);
  const md = renderMarkdownReport({
    analysis,
    redactions: { total: 3, hits: [{ category: "bearer-token", count: 3 }] },
  });

  assert.ok(md.includes("3"), "the redaction count must be visible");
  assert.ok(md.includes("bearer-token"));
});
