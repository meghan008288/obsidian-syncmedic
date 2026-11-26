import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RULE_ANCHORS } from "../src/rule-anchors.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, "..", "scripts", "check_fingerprints.ts");

/**
 * Runs the drift check against a fake copy of the upstream repositories so
 * that the result does not depend on the network or on what the upstream
 * projects happen to print today.
 */
function runCheck(files: Record<string, string>): {
  code: number | null;
  report: string;
} {
  const root = mkdtempSync(join(tmpdir(), "syncmedic-drift-"));
  const localSrc = join(root, "src");
  for (const [name, content] of Object.entries(files)) {
    const path = join(localSrc, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf-8");
  }
  const reportPath = join(root, "report.md");
  const result = spawnSync(
    process.execPath,
    [SCRIPT, "--offline", "--local-src", localSrc, "--report", reportPath],
    { encoding: "utf-8" }
  );
  return {
    code: result.status,
    report: readFileSync(reportPath, "utf-8"),
  };
}

/**
 * Builds the fake upstream files a rule needs, with every literal it is
 * pinned to really written into them.
 */
function upstreamWith(ruleId: string, except: string[] = []): Record<string, string> {
  const files: Record<string, string> = {};
  for (const anchor of RULE_ANCHORS[ruleId] ?? []) {
    if (anchor.kind !== "source") continue;
    if (except.includes(anchor.literal)) continue;
    const name = `${anchor.project}/${anchor.target}`;
    files[name] = `${files[name] ?? ""}// ${anchor.literal}\n`;
  }
  return files;
}

test("a fingerprint that is still upstream passes the check", () => {
  const { code, report } = runCheck(upstreamWith("RS-04"));
  assert.equal(code, 0, report);
  assert.match(report, /RESULT: no-drift/);
  assert.match(report, /1 ok/);
});

test("an upstream rewrite is reported as a drift and fails the check", () => {
  const { code, report } = runCheck({
    ["remotely-save/src/fsWebdav.ts"]: `throw new Error("the file could not be written");\n`,
  });
  assert.equal(code, 1, report);
  assert.match(report, /RESULT: drift/);
  assert.match(report, /DRIFT\s+RS-04/);
});

test("a rule that lost only some of its fingerprints is reported but does not fail", () => {
  const files = upstreamWith("RS-09", ["error after prepareByCallingWorker"]);
  const { code, report } = runCheck(files);
  assert.equal(code, 0, report);
  assert.match(report, /partial\s+RS-09/);
  assert.match(report, /RESULT: no-drift/);
});

test("a rule whose fingerprints are all gone fails the check", () => {
  const files = upstreamWith("RS-09");
  for (const name of Object.keys(files)) {
    files[name] = "// the upstream rewrote this\n";
  }
  const { code, report } = runCheck(files);
  assert.equal(code, 1, report);
  assert.match(report, /DRIFT\s+RS-09/);
});

test("a check that could not look at anything says so instead of passing", () => {
  const { code, report } = runCheck({});
  assert.equal(code, 2, report);
  assert.match(report, /RESULT: unverifiable/);
});
