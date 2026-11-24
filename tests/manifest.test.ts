import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { PLUGIN_VERSION } from "../src/settings.ts";

const manifest = JSON.parse(
  readFileSync(new URL("../manifest.json", import.meta.url), "utf8")
) as Record<string, unknown>;

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

test("the manifest carries every field Obsidian requires", () => {
  for (const field of [
    "id",
    "name",
    "version",
    "minAppVersion",
    "description",
    "author",
    "authorUrl",
    "isDesktopOnly",
  ]) {
    assert.ok(field in manifest, `manifest.json is missing "${field}"`);
  }
});

test("the plugin id is a valid Obsidian id", () => {
  const id = String(manifest.id);
  // Verified against the real registry: 10844 community plugins, 2074 of them
  // have no hyphen at all (dataview, quickadd, calendar ...), so a hyphen is
  // NOT required. Obsidian accepts letters, digits, dot, dash and underscore.
  assert.match(id, /^[A-Za-z0-9._-]+$/, "id must use Obsidian-safe characters");
  assert.equal(id, "syncmedic", "the id must match the plugin folder name");
});

test("the display name follows the community directory naming rules", () => {
  const name = String(manifest.name);
  // Official rule, docs.obsidian.md/Reference/Manifest#name: Basic Latin
  // characters only, and no punctuation except hyphens, plus signs and
  // parentheses. The first submission was rejected over exactly this rule:
  // the name used to be "SyncMedic - 同步急诊室".
  assert.match(
    name,
    /^[A-Za-z0-9 ()+\-]+$/,
    "name must be Basic Latin; only hyphens, plus signs and parentheses may be used as punctuation"
  );
  assert.doesNotMatch(
    name,
    /obsidian|obsi-|-sidian/i,
    "name must not contain Obsidian or a variation of it"
  );
  assert.doesNotMatch(
    name,
    /plugin/i,
    "a plugin name may not contain the word Plugin"
  );
});

test("the entry we would submit to the community registry has every required field", () => {
  // Verified against obsidianmd/obsidian-releases community-plugins.json:
  // all 10844 entries carry exactly id / name / author / repo / description.
  const entry = {
    id: manifest.id,
    name: manifest.name,
    author: manifest.author,
    description: manifest.description,
    repo: "owner/obsidian-syncmedic",
  };
  for (const field of ["id", "name", "author", "description", "repo"]) {
    assert.ok(
      String((entry as Record<string, unknown>)[field]).trim().length > 0,
      `registry entry is missing "${field}"`
    );
  }
  assert.ok(String(entry.name).length <= 56, "name is longer than the longest in the registry");
  assert.ok(
    String(entry.description).length <= 413,
    "description is longer than the longest in the registry"
  );
});

test("the manifest version and the in-code version never drift apart", () => {
  assert.equal(manifest.version, PLUGIN_VERSION);
  assert.match(String(manifest.version), SEMVER);
});

test("the minimum app version is a valid semver", () => {
  assert.match(String(manifest.minAppVersion), SEMVER);
});

test("the author url is a real https url", () => {
  const url = String(manifest.authorUrl);
  assert.match(url, /^https:\/\//);
  assert.doesNotThrow(() => new URL(url));
});

test("the funding url is either absent or a real https url", () => {
  if (manifest.fundingUrl === undefined) return;
  const urls =
    typeof manifest.fundingUrl === "string"
      ? [manifest.fundingUrl]
      : Object.values(manifest.fundingUrl as Record<string, string>);
  for (const url of urls) {
    assert.match(String(url), /^https:\/\//);
  }
});

test("isDesktopOnly is a boolean", () => {
  assert.equal(typeof manifest.isDesktopOnly, "boolean");
});

test("the plugin is not marked desktop-only, because the collector uses the cross-platform vault adapter", () => {
  assert.equal(manifest.isDesktopOnly, false);
});

test("the description says what the plugin does and that nothing leaves the machine", () => {
  const description = String(manifest.description);
  assert.ok(description.length > 20);
  // The requirement is semantic, not language-specific: the marketplace
  // description has to state that the plugin does not phone home.
  assert.match(
    description,
    /本机|不上传|own machine|nothing leaves|never leaves|local/i
  );
});
