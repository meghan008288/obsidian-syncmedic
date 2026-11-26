/**
 * End-to-end verification against real log samples.
 *
 * Runs the real pipeline (the same code that ships inside main.js) over the
 * sample vault on disk, using a node:fs-backed adapter - the closest thing
 * to running inside Obsidian without Obsidian.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runDiagnostics } from "../src/pipeline.ts";
import { RULES } from "../src/rules.ts";
import type { VaultAdapter } from "../src/logs.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sampleRoot = path.join(here, "..", "samples");

/** Real filesystem adapter, mirroring Obsidian's DataAdapter contract. */
class NodeFsAdapter implements VaultAdapter {
  readonly configDir = ".obsidian";
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  private absolute(vaultPath: string): string {
    return path.join(this.root, vaultPath);
  }

  async exists(vaultPath: string): Promise<boolean> {
    try {
      await fs.access(this.absolute(vaultPath));
      return true;
    } catch {
      return false;
    }
  }

  async read(vaultPath: string): Promise<string> {
    return fs.readFile(this.absolute(vaultPath), "utf8");
  }

  async list(vaultPath: string): Promise<{ files: string[]; folders: string[] }> {
    const absolute = this.absolute(vaultPath);
    const entries = await fs.readdir(absolute, { withFileTypes: true });
    const files: string[] = [];
    const folders: string[] = [];
    for (const entry of entries) {
      const child = vaultPath === "" ? entry.name : `${vaultPath}/${entry.name}`;
      if (entry.isDirectory()) folders.push(child);
      else files.push(child);
    }
    return { files, folders };
  }
}

const adapter = new NodeFsAdapter(sampleRoot);
const result = await runDiagnostics({
  adapter,
  pluginVersion: "0.1.8",
  vaultName: "sample-vault",
  generatedAt: "2026-11-24 09:20:00",
});

console.log("=".repeat(78));
console.log("SUMMARY:", result.summary);
console.log("=".repeat(78));
console.log(`scanned: ${result.analysis.scannedDocuments} files / ${result.analysis.scannedLines} lines`);
console.log(`matched files: ${result.analysis.matchedDocuments}`);
console.log(`redactions: ${result.redactions.total}`, result.redactions.hits);
console.log("");

const fired = new Set(result.analysis.matches.map((m) => m.ruleId));
console.log("RULE COVERAGE");
for (const rule of RULES) {
  const hit = result.analysis.matches.find((m) => m.ruleId === rule.id);
  const mark = hit ? `HIT  x${hit.occurrences}` : "miss";
  console.log(
    `  ${rule.id.padEnd(6)} ${mark.padEnd(10)} [${rule.severity.padEnd(8)}] ${rule.title}`
  );
}
console.log("");
console.log(`fired ${fired.size} / ${RULES.length} rules`);
console.log("");

console.log("SOURCES");
for (const source of result.collection.sources) {
  console.log(
    `  ${source.found > 0 ? "OK  " : "MISS"} ${source.label} (${source.found})`
  );
}
console.log("");
if (result.collection.errors.length > 0) {
  console.log("ERRORS");
  for (const error of result.collection.errors) console.log(`  - ${error}`);
  console.log("");
}

console.log("=".repeat(78));
console.log("MARKDOWN REPORT");
console.log("=".repeat(78));
console.log(result.markdown);
