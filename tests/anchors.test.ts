import { test } from "node:test";
import assert from "node:assert/strict";

import { RULES } from "../src/rules.ts";
import { RULE_ANCHORS, UPSTREAM_PROJECTS } from "../src/rule-anchors.ts";

const patternsOf = (rule: (typeof RULES)[number]): string[] =>
  rule.groups.flatMap((group) => group.map((regex) => regex.source));

test("every rule is pinned to the upstream text it depends on", () => {
  for (const rule of RULES) {
    const anchor = RULE_ANCHORS[rule.id];
    assert.ok(anchor, `${rule.id} has no anchor in src/rule-anchors.ts`);
  }
  assert.equal(
    Object.keys(RULE_ANCHORS).length,
    RULES.length,
    "every anchor belongs to exactly one rule"
  );
});

test("an anchor points at the upstream project the rule reads logs from", () => {
  for (const rule of RULES) {
    const anchor = RULE_ANCHORS[rule.id];
    assert.equal(anchor.project, rule.scope, `${rule.id} points at the wrong project`);
    assert.ok(UPSTREAM_PROJECTS[anchor.project], `${rule.id} has an unknown project`);
  }
});

test("an issue anchor cites an issue the rule already references", () => {
  for (const rule of RULES) {
    const anchor = RULE_ANCHORS[rule.id];
    if (anchor.kind !== "issue") continue;
    const cited = rule.issues.some(
      (issue) => String(issue.number) === anchor.target
    );
    assert.ok(
      cited,
      `${rule.id} is pinned to issue ${anchor.target} but the rule does not cite it`
    );
  }
});

test("a source anchor points at a file inside the upstream repository", () => {
  for (const rule of RULES) {
    const anchor = RULE_ANCHORS[rule.id];
    if (anchor.kind !== "source") continue;
    assert.match(
      anchor.target,
      /^[\w./-]+\.[a-z]+$/,
      `${rule.id} does not point at a file`
    );
    assert.ok(
      anchor.target.includes("/"),
      `${rule.id} should point at a file inside the repository`
    );
  }
});

test("an anchor protects the fingerprint it is supposed to protect", () => {
  for (const rule of RULES) {
    const anchor = RULE_ANCHORS[rule.id];
    const patterns = patternsOf(rule).map((pattern) =>
      pattern.replace(/\\/g, "").toLowerCase()
    );
    const covered = patterns.some((pattern) =>
      pattern.includes(anchor.literal.toLowerCase())
    );
    assert.ok(
      covered || anchor.reason,
      `${rule.id} is pinned to "${anchor.literal}" which is not part of its fingerprint and has no reason`
    );
  }
});

test("an anchor says whether the upstream still emits the message", () => {
  for (const rule of RULES) {
    const anchor = RULE_ANCHORS[rule.id];
    assert.ok(
      ["active", "legacy"].includes(anchor.status),
      `${rule.id} has an unknown status`
    );
    assert.ok(anchor.literal.trim().length > 0, `${rule.id} has an empty literal`);
  }
});
