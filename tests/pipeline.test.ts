import { test } from "node:test";
import assert from "node:assert/strict";

import { runDiagnostics } from "../src/pipeline.ts";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings.ts";
import type { VaultAdapter } from "../src/logs.ts";

class FakeAdapter implements VaultAdapter {
  files = new Map<string, string>();
  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
  async read(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`ENOENT: ${path}`);
    return value;
  }
  async list(path: string): Promise<{ files: string[]; folders: string[] }> {
    const prefix = path === "" ? "" : path.endsWith("/") ? path : `${path}/`;
    const files: string[] = [];
    const folders = new Set<string>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (rest === "") continue;
      if (rest.includes("/")) folders.add(prefix + rest.split("/")[0]);
      else files.push(key);
    }
    return { files, folders: [...folders] };
  }
}

test("the pipeline redacts the collected text before the rules see it", async () => {
  const adapter = new FakeAdapter();
  adapter.files.set(
    "_debug_remotely_save/log_hist_exported_on_1.md",
    [
      "plugin:remotely-save:234 Error: Request failed, status 403 " +
        "(Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.leaked)",
      "password: hunter2",
    ].join("\n")
  );

  const result = await runDiagnostics({ adapter });

  assert.ok(!result.markdown.includes("eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.leaked"));
  assert.ok(!result.markdown.includes("hunter2"));
  assert.ok(result.redactions.total >= 2);
  assert.ok(result.markdown.includes("[REDACTED:bearer-token]"));
});

test("the pipeline still matches the rule after redaction", async () => {
  const adapter = new FakeAdapter();
  adapter.files.set(
    "_debug_remotely_save/log_hist_exported_on_1.md",
    "plugin:remotely-save:234 Error: Request failed, status 403"
  );

  const result = await runDiagnostics({ adapter });
  assert.ok(result.analysis.matches.some((m) => m.ruleId === "RS-01"));
});

test("the pipeline reports a redaction count per category", async () => {
  const adapter = new FakeAdapter();
  adapter.files.set(
    "_debug_remotely_save/log_hist_exported_on_1.md",
    ["Authorization: Bearer aaa.bbb.ccc", "password: hunter2"].join("\n")
  );

  const result = await runDiagnostics({ adapter });
  const categories = result.redactions.hits.map((h) => h.category);
  assert.ok(categories.includes("bearer-token"));
  assert.ok(categories.includes("password"));
});

test("the pipeline produces both a markdown and a json report", async () => {
  const adapter = new FakeAdapter();
  adapter.files.set(
    "_debug_remotely_save/log_hist_exported_on_1.md",
    "plugin:remotely-save:234 Error: Request failed, status 403"
  );

  const result = await runDiagnostics({ adapter, pluginVersion: "0.1.0" });

  assert.ok(result.markdown.startsWith("# SyncMedic"));
  const parsed = JSON.parse(result.json);
  assert.equal(parsed.pluginVersion, "0.1.0");
  assert.ok(result.summary.includes("RS-01"));
});

test("a LiveSync log file is only matched by LiveSync rules", async () => {
  const adapter = new FakeAdapter();
  adapter.files.set(
    "livesync_log_a.md",
    "The preflight fetch failed with a CORS Error"
  );

  const result = await runDiagnostics({ adapter });
  assert.ok(result.analysis.matches.some((m) => m.ruleId === "LS-01"));
  assert.equal(
    result.analysis.matches.filter((m) => m.ruleId.startsWith("RS-")).length,
    0
  );
});

test("the pipeline passes pasted console text through as an unknown source", async () => {
  const adapter = new FakeAdapter();
  const result = await runDiagnostics({
    adapter,
    pasted: "plugin:remotely-save:234 Error: net::ERR_TIMED_OUT",
  });

  assert.ok(result.analysis.matches.some((m) => m.ruleId === "RS-06"));
  assert.equal(result.collection.documents[0].pluginId, "unknown");
});

test("the pipeline survives a vault with no logs at all", async () => {
  const adapter = new FakeAdapter();
  const result = await runDiagnostics({ adapter });

  assert.equal(result.analysis.matches.length, 0);
  assert.ok(result.markdown.includes("没有命中"));
  assert.ok(result.summary.includes("没有命中"));
});

test("normalizeSettings keeps known values and fills in the rest", () => {
  const settings = normalizeSettings({ maxFiles: 10 });

  assert.equal(settings.maxFiles, 10);
  assert.equal(settings.maxBytesPerFile, DEFAULT_SETTINGS.maxBytesPerFile);
  assert.equal(settings.scanOnStartup, DEFAULT_SETTINGS.scanOnStartup);
});

test("normalizeSettings rejects nonsense values and falls back to the defaults", () => {
  const settings = normalizeSettings({
    maxFiles: -5,
    maxBytesPerFile: "not a number",
    scanOnStartup: "yes",
  });

  assert.equal(settings.maxFiles, DEFAULT_SETTINGS.maxFiles);
  assert.equal(settings.maxBytesPerFile, DEFAULT_SETTINGS.maxBytesPerFile);
  assert.equal(settings.scanOnStartup, DEFAULT_SETTINGS.scanOnStartup);
});

test("normalizeSettings handles a completely empty object", () => {
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
});

test("the pipeline honours the maxFiles limit from the settings", async () => {
  const adapter = new FakeAdapter();
  for (let i = 0; i < 12; i++) {
    adapter.files.set(`livesync_log_${i}.md`, `entry ${i}`);
  }

  const result = await runDiagnostics({ adapter, settings: { maxFiles: 3 } });
  assert.equal(result.collection.documents.length, 3);
});
