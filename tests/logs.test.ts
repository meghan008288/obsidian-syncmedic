import { test } from "node:test";
import assert from "node:assert/strict";

import {
  collectLogs,
  type CollectedDocument,
  type VaultAdapter,
} from "../src/logs.ts";

/** In-memory stand-in for Obsidian's DataAdapter. */
class FakeAdapter implements VaultAdapter {
  configDir = ".obsidian";
  files = new Map<string, string>();
  missingFolders = new Set<string>();
  listCalls: string[] = [];

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async read(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`ENOENT: ${path}`);
    return value;
  }

  async list(path: string): Promise<{ files: string[]; folders: string[] }> {
    this.listCalls.push(path);
    if (this.missingFolders.has(path)) {
      throw new Error(`ENOENT: ${path}`);
    }
    const prefix = path === "" ? "" : path.endsWith("/") ? path : `${path}/`;
    const files: string[] = [];
    const folders = new Set<string>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (rest === "") continue;
      if (rest.includes("/")) {
        folders.add(prefix + rest.split("/")[0]);
      } else {
        files.push(key);
      }
    }
    return { files, folders: [...folders] };
  }
}

function adapterWith(files: Record<string, string>): FakeAdapter {
  const adapter = new FakeAdapter();
  for (const [path, content] of Object.entries(files)) {
    adapter.files.set(path, content);
  }
  return adapter;
}

function paths(result: { documents: CollectedDocument[] }): string[] {
  return result.documents.map((d) => d.path).sort();
}

test("collects the LiveSync log file from the vault root", async () => {
  const adapter = adapterWith({
    "livesync_log_2026-01-01.md": "10/14/2024, 10:53:06 AM->Error:Failed: CollectChunksInternal",
    "notes/todo.md": "# todo",
  });
  const result = await collectLogs(adapter);

  assert.deepEqual(paths(result), ["livesync_log_2026-01-01.md"]);
  assert.equal(result.documents[0].pluginId, "obsidian-livesync");
  assert.ok(result.documents[0].text.includes("CollectChunksInternal"));
});

test("collects the Remotely Save debug export folder", async () => {
  const adapter = adapterWith({
    "_debug_remotely_save/log_hist_exported_on_1767225600000.md":
      "plugin:remotely-save:234 Error: Request failed, status 403",
    "_debug_remotely_save/sync_plans_hist_exported_on_1767225600000.md":
      '[{"path":"a.md","change":true}]',
    "notes/todo.md": "# todo",
  });
  const result = await collectLogs(adapter);

  const found = paths(result);
  assert.ok(found.includes("_debug_remotely_save/log_hist_exported_on_1767225600000.md"));
  assert.ok(
    found.includes("_debug_remotely_save/sync_plans_hist_exported_on_1767225600000.md")
  );
  assert.ok(!found.includes("notes/todo.md"), "unrelated notes must be ignored");
  assert.equal(
    result.documents.find((d) => d.path.includes("log_hist"))?.pluginId,
    "remotely-save"
  );
});

test("collects a Logstravaganza note but treats it as an unknown source", async () => {
  const adapter = adapterWith({
    "LOGGING-NOTE (Pixel 7).md": "plugin:remotely-save:234 Error: net::ERR_TIMED_OUT",
  });
  const result = await collectLogs(adapter);

  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].pluginId, "unknown");
});

test("collects log files that live inside the plugin folders", async () => {
  const adapter = adapterWith({
    ".obsidian/plugins/remotely-save/debug.log": "some error while deleting",
    ".obsidian/plugins/obsidian-livesync/logs/events.log": "The preflight fetch failed with a CORS Error",
    ".obsidian/plugins/remotely-save/main.js": "console.log('not a log')",
  });
  const result = await collectLogs(adapter);

  const found = paths(result);
  assert.ok(found.includes(".obsidian/plugins/remotely-save/debug.log"));
  assert.ok(found.includes(".obsidian/plugins/obsidian-livesync/logs/events.log"));
  assert.ok(!found.includes(".obsidian/plugins/remotely-save/main.js"));
  assert.equal(
    result.documents.find((d) => d.path.includes("remotely-save"))?.pluginId,
    "remotely-save"
  );
  assert.equal(
    result.documents.find((d) => d.path.includes("obsidian-livesync"))?.pluginId,
    "obsidian-livesync"
  );
});

test("plugin folders are resolved from the configuration folder the adapter reports", async () => {
  const adapter = adapterWith({
    "my-config/plugins/remotely-save/debug.log": "some error while deleting",
  });
  adapter.configDir = "my-config";
  const result = await collectLogs(adapter);

  assert.ok(
    adapter.listCalls.includes("my-config/plugins/remotely-save/"),
    "the collector must look where the adapter says, not in a hard-coded folder"
  );
  assert.ok(paths(result).includes("my-config/plugins/remotely-save/debug.log"));
});

test("a file matched by two sources is collected only once", async () => {
  const adapter = adapterWith({
    ".obsidian/plugins/obsidian-livesync/livesync_log_x.md": "hello",
  });
  const result = await collectLogs(adapter);
  assert.equal(result.documents.length, 1);
});

test("every source reports whether anything was found, with a hint when not", async () => {
  const adapter = adapterWith({ "notes/todo.md": "# todo" });
  const result = await collectLogs(adapter);

  assert.ok(result.sources.length >= 4);
  for (const source of result.sources) {
    assert.equal(source.found, 0);
    assert.ok(source.hint.length > 10, `${source.id} needs a usable hint`);
  }
});

test("a missing folder is reported as an error but does not break collection", async () => {
  const adapter = adapterWith({ "livesync_log_a.md": "x" });
  adapter.missingFolders.add(".obsidian/plugins/obsidian-livesync/");
  adapter.missingFolders.add(".obsidian/plugins/livesync/");
  adapter.missingFolders.add("_debug_remotely_save/");
  adapter.missingFolders.add(".obsidian/plugins/remotely-save/");

  const result = await collectLogs(adapter);

  assert.equal(result.documents.length, 1);
  assert.ok(result.errors.length > 0, "missing folders must be reported");
});

test("a file longer than the cap is truncated and flagged", async () => {
  const adapter = adapterWith({
    "livesync_log_big.md": "x".repeat(5000),
  });
  const result = await collectLogs(adapter, { maxBytesPerFile: 100 });

  assert.equal(result.documents[0].text.length, 100);
  assert.equal(result.documents[0].truncated, true);
  assert.equal(result.documents[0].bytes, 5000);
});

test("the total number of collected files is capped", async () => {
  const files: Record<string, string> = {};
  for (let i = 0; i < 30; i++) {
    files[`livesync_log_${i}.md`] = `entry ${i}`;
  }
  const result = await collectLogs(adapterWith(files), { maxFiles: 5 });
  assert.equal(result.documents.length, 5);
});

test("an empty vault yields no documents and no crash", async () => {
  const result = await collectLogs(adapterWith({}));
  assert.equal(result.documents.length, 0);
  assert.equal(result.errors.length, 0);
});

test("pasted console output is collected as an unknown-source document", async () => {
  const adapter = adapterWith({});
  const result = await collectLogs(adapter, {
    pasted: "plugin:remotely-save:234 Error: Request failed, status 403",
  });

  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].pluginId, "unknown");
  assert.ok(result.documents[0].text.includes("status 403"));
});
