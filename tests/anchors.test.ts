import { test } from "node:test";
import assert from "node:assert/strict";

import { RULES } from "../src/rules.ts";
import { RULE_ANCHORS, UPSTREAM_PROJECTS } from "../src/rule-anchors.ts";

const patternsOf = (rule: (typeof RULES)[number]): string[] =>
  rule.groups.flatMap((group) => group.map((regex) => regex.source));

const anchorsOf = (rule: (typeof RULES)[number]) => RULE_ANCHORS[rule.id] ?? [];

test("every rule is pinned to the upstream text it depends on", () => {
  for (const rule of RULES) {
    assert.ok(
      anchorsOf(rule).length > 0,
      `${rule.id} has no anchor in src/rule-anchors.ts`
    );
  }
  assert.equal(
    Object.keys(RULE_ANCHORS).length,
    RULES.length,
    "every anchor belongs to exactly one rule"
  );
});

test("an anchor points at the upstream project the rule reads logs from", () => {
  for (const rule of RULES) {
    for (const anchor of anchorsOf(rule)) {
      assert.equal(anchor.project, rule.scope, `${rule.id} points at the wrong project`);
      assert.ok(UPSTREAM_PROJECTS[anchor.project], `${rule.id} has an unknown project`);
    }
  }
});

test("an issue anchor cites an issue the rule already references", () => {
  for (const rule of RULES) {
    for (const anchor of anchorsOf(rule)) {
      if (anchor.kind !== "issue") continue;
      const cited = rule.issues.some(
        (issue) => String(issue.number) === anchor.target
      );
      assert.ok(
        cited,
        `${rule.id} is pinned to issue ${anchor.target} but the rule does not cite it`
      );
    }
  }
});

test("a source anchor points at a file inside the upstream repository", () => {
  for (const rule of RULES) {
    for (const anchor of anchorsOf(rule)) {
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
  }
});

test("an anchor protects the fingerprint it is supposed to protect", () => {
  for (const rule of RULES) {
    const patterns = patternsOf(rule).map((pattern) =>
      pattern.replace(/\\/g, "").toLowerCase()
    );
    for (const anchor of anchorsOf(rule)) {
      const covered = patterns.some((pattern) =>
        pattern.includes(anchor.literal.toLowerCase())
      );
      assert.ok(
        covered || anchor.reason,
        `${rule.id} is pinned to "${anchor.literal}" which is not part of its fingerprint and has no reason`
      );
    }
  }
});

test("a rule that pins more than one fingerprint pins all of them", () => {
  for (const rule of RULES) {
    const anchors = anchorsOf(rule);
    if (anchors.length < 2) continue;
    const literals = anchors.map((anchor) => anchor.literal.toLowerCase());
    for (const pattern of patternsOf(rule)) {
      const source = pattern.replace(/\\/g, "").toLowerCase();
      const covered = literals.some(
        (literal) => source.includes(literal) || literal.includes(source)
      );
      assert.ok(
        covered,
        `${rule.id}: the fingerprint "${pattern}" is not pinned to any upstream place`
      );
    }
  }
});

test("an anchor says whether the upstream still emits the message", () => {
  for (const rule of RULES) {
    for (const anchor of anchorsOf(rule)) {
      assert.ok(
        ["active", "legacy"].includes(anchor.status),
        `${rule.id} has an unknown status`
      );
      assert.ok(anchor.literal.trim().length > 0, `${rule.id} has an empty literal`);
    }
  }
});

test("no rule is pinned to a fingerprint that the upstream only has in a comment", () => {
  // The end-to-end encryption rule used to be pinned to "main: receiving
  // error in ...", which only ever existed as a commented out console.debug
  // call. Its fingerprints now have to be text the upstream really prints.
  const rs09 = anchorsOf(RULES.find((rule) => rule.id === "RS-09")!);
  assert.ok(rs09.length > 1, "RS-09 should pin every one of its fingerprints");
  for (const anchor of rs09) {
    assert.ok(
      !anchor.literal.includes("receiving error in"),
      "RS-09 is still pinned to the commented out debug line"
    );
    assert.equal(anchor.status, "active");
  }
});
