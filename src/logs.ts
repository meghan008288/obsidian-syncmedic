/**
 * Log collection.
 *
 * Everything is discovered at runtime instead of being hard-coded, because
 * both upstream plugins move their files around:
 *   - LiveSync writes `livesync_log_*` into the vault root when the
 *     "Write logs into the file" setting is on (verified in the plugin's own
 *     e2e test: `vault.getFiles().find(f => f.path.startsWith("livesync_log_"))`);
 *   - Remotely Save has no log file at all - it only prints to the Obsidian
 *     console - but it can export its history into the vault folder
 *     `_debug_remotely_save/` with the `log_hist_exported_on_` prefix
 *     (verified in `src/baseTypes.ts`).
 *
 * The collector talks to a tiny adapter interface so that it works on both
 * desktop and mobile Obsidian (`app.vault.adapter`) and can be unit tested
 * without Obsidian.
 */

export interface VaultAdapter {
  /**
   * Obsidian's configuration folder. The user can rename it, so it is never
   * hard-coded; plugin folders are resolved from this at runtime.
   */
  readonly configDir: string;
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
}

export interface LogSourceSpec {
  id: string;
  label: string;
  /** Plugin the content belongs to, or "unknown" for pasted console output. */
  pluginId: string;
  /** Folders to scan. "" means the vault root. */
  roots: string[];
  /** File name must start with one of these. */
  prefixes?: string[];
  /** File name must end with one of these. */
  suffixes?: string[];
  /** Extra folders to scan inside every root. */
  extraFolders?: string[];
  /**
   * A missing directory in an optional source is normal (the plugin simply
   * is not installed) and must not be reported as an error.
   */
  optional?: boolean;
  /** Shown to the user when nothing was found here. */
  hint: string;
}

export interface CollectedDocument {
  pluginId: string;
  path: string;
  text: string;
  sourceId: string;
  sourceLabel: string;
  bytes: number;
  /** True when the file was longer than the configured cap and got cut. */
  truncated: boolean;
}

export interface SourceStatus {
  id: string;
  label: string;
  pluginId: string;
  found: number;
  hint: string;
}

export interface CollectionResult {
  documents: CollectedDocument[];
  sources: SourceStatus[];
  errors: string[];
}

export interface CollectOptions {
  /** Maximum characters read from a single file. */
  maxBytesPerFile?: number;
  /** Maximum number of files collected in total. */
  maxFiles?: number;
  /** Console output pasted by the user; treated as an unknown source. */
  pasted?: string;
}

const DEFAULT_MAX_BYTES_PER_FILE = 2_000_000;
const DEFAULT_MAX_FILES = 50;

/**
 * Placeholder for Obsidian's configuration folder inside a source root. It is
 * replaced with `adapter.configDir` at collection time, because the user can
 * rename that folder and we must not assume where it lives.
 */
export const CONFIG_DIR_TOKEN = "{configDir}";

export const LOG_SOURCES: LogSourceSpec[] = [
  {
    id: "livesync-log",
    label: "LiveSync log file (livesync_log_*)",
    pluginId: "obsidian-livesync",
    roots: [""],
    prefixes: ["livesync_log_"],
    hint:
      "Turn on “Write logs into the file” in the LiveSync settings and the log lands in the vault root with a livesync_log_ prefix.",
  },
  {
    id: "livesync-plugin-dir",
    label: "LiveSync plugin folder",
    pluginId: "obsidian-livesync",
    roots: [
      `${CONFIG_DIR_TOKEN}/plugins/obsidian-livesync/`,
      `${CONFIG_DIR_TOKEN}/plugins/livesync/`,
    ],
    prefixes: ["livesync_log_"],
    suffixes: [".log", ".txt"],
    extraFolders: ["logs/"],
    optional: true,
    hint:
      "Make sure LiveSync is installed. If the log is not in the plugin folder, turn on “Write logs into the file” in the settings and reproduce the failure once.",
  },
  {
    id: "remotely-save-debug",
    label: "Remotely Save debug export (_debug_remotely_save/)",
    pluginId: "remotely-save",
    roots: ["_debug_remotely_save/"],
    prefixes: [
      "log_hist_exported_on_",
      "sync_plans_hist_exported_on_",
      "profiler_results_exported_on_",
    ],
    hint:
      "Remotely Save does not write log files, it only prints to the Obsidian console. Use its debug export to save the log into _debug_remotely_save/ and then collect it.",
  },
  {
    id: "remotely-save-plugin-dir",
    label: "Remotely Save plugin folder",
    pluginId: "remotely-save",
    roots: [`${CONFIG_DIR_TOKEN}/plugins/remotely-save/`],
    suffixes: [".log", ".txt"],
    extraFolders: ["logs/"],
    optional: true,
    hint:
      "An empty plugin folder is normal here (upstream does not write to disk). Use Logstravaganza to keep the console output, or paste the console output in directly.",
  },
  {
    id: "logstravaganza",
    label: "Logstravaganza log note",
    pluginId: "unknown",
    roots: [""],
    prefixes: ["LOGGING-NOTE"],
    hint:
      "The Logstravaganza plugin can save console output as LOGGING-NOTE*.md. This is the approach the Remotely Save docs recommend on iOS.",
  },
];

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function joinPath(root: string, child: string): string {
  if (root === "") return child;
  return root.endsWith("/") ? `${root}${child}` : `${root}/${child}`;
}

function matchesName(file: string, source: LogSourceSpec): boolean {
  const name = baseName(file);
  const hasPrefix = source.prefixes ?? [];
  const hasSuffix = source.suffixes ?? [];
  if (hasPrefix.length === 0 && hasSuffix.length === 0) return true;
  if (hasPrefix.some((prefix) => name.startsWith(prefix))) return true;
  if (hasSuffix.some((suffix) => name.endsWith(suffix))) return true;
  return false;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Replaces the configuration-folder placeholder in a source root with the
 * folder Obsidian actually uses.
 */
function resolveConfigDir(root: string, configDir: string): string {
  if (!root.startsWith(CONFIG_DIR_TOKEN)) return root;
  return configDir + root.slice(CONFIG_DIR_TOKEN.length);
}

export async function collectLogs(
  adapter: VaultAdapter,
  options?: CollectOptions
): Promise<CollectionResult> {
  const maxBytes = options?.maxBytesPerFile ?? DEFAULT_MAX_BYTES_PER_FILE;
  const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES;

  const documents: CollectedDocument[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];
  const sources: SourceStatus[] = [];

  for (const source of LOG_SOURCES) {
    let found = 0;

    for (const rawRoot of source.roots) {
      const root = resolveConfigDir(rawRoot, adapter.configDir);
      const directories = [
        root,
        ...(source.extraFolders ?? []).map((folder) => joinPath(root, folder)),
      ];

      for (const directory of directories) {
        if (documents.length >= maxFiles) break;

        let listing: { files: string[]; folders: string[] };
        try {
          listing = await adapter.list(directory);
        } catch (error) {
          if (!source.optional) {
            errors.push(
              `${source.label}: cannot read the directory ${directory === "" ? "(vault root)" : directory} (${errorMessage(error)})`
            );
          }
          continue;
        }

        for (const file of listing.files) {
          if (documents.length >= maxFiles) break;
          if (!matchesName(file, source)) continue;
          if (seen.has(file)) continue;

          let text: string;
          try {
            text = await adapter.read(file);
          } catch (error) {
            errors.push(`${source.label}: failed to read ${file} (${errorMessage(error)})`);
            continue;
          }

          seen.add(file);
          const truncated = text.length > maxBytes;
          documents.push({
            pluginId: source.pluginId,
            path: file,
            text: truncated ? text.slice(0, maxBytes) : text,
            sourceId: source.id,
            sourceLabel: source.label,
            bytes: text.length,
            truncated,
          });
          found += 1;
        }
      }
    }

    sources.push({
      id: source.id,
      label: source.label,
      pluginId: source.pluginId,
      found,
      hint: source.hint,
    });
  }

  const pasted = options?.pasted?.trim();
  if (pasted) {
    documents.push({
      pluginId: "unknown",
      path: "Pasted console output",
      text: pasted,
      sourceId: "pasted",
      sourceLabel: "Pasted console output",
      bytes: pasted.length,
      truncated: false,
    });
  }

  return { documents, sources, errors };
}
