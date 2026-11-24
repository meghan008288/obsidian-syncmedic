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
    label: "LiveSync 日志文件（livesync_log_*）",
    pluginId: "obsidian-livesync",
    roots: [""],
    prefixes: ["livesync_log_"],
    hint:
      "LiveSync 设置里打开 “Write logs into the file”，日志就会以 livesync_log_ 开头落在 vault 根目录。",
  },
  {
    id: "livesync-plugin-dir",
    label: "LiveSync 插件目录",
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
      "确认 LiveSync 已安装。如果日志不在插件目录，去设置里打开 “Write logs into the file” 再复现一次故障。",
  },
  {
    id: "remotely-save-debug",
    label: "Remotely Save 调试导出（_debug_remotely_save/）",
    pluginId: "remotely-save",
    roots: ["_debug_remotely_save/"],
    prefixes: [
      "log_hist_exported_on_",
      "sync_plans_hist_exported_on_",
      "profiler_results_exported_on_",
    ],
    hint:
      "Remotely Save 自己不写日志文件，只往 Obsidian 控制台输出。用它的调试导出功能把日志存进 _debug_remotely_save/ 再采集。",
  },
  {
    id: "remotely-save-plugin-dir",
    label: "Remotely Save 插件目录",
    pluginId: "remotely-save",
    roots: [`${CONFIG_DIR_TOKEN}/plugins/remotely-save/`],
    suffixes: [".log", ".txt"],
    extraFolders: ["logs/"],
    optional: true,
    hint:
      "插件目录里没有日志属于正常情况（上游不落盘）。改用 Logstravaganza 存控制台输出，或者直接把控制台内容粘贴进来。",
  },
  {
    id: "logstravaganza",
    label: "Logstravaganza 日志笔记",
    pluginId: "unknown",
    roots: [""],
    prefixes: ["LOGGING-NOTE"],
    hint:
      "装 Logstravaganza 插件可以把控制台输出存成 LOGGING-NOTE*.md，这是 Remotely Save 官方文档推荐的 iOS 做法。",
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
              `${source.label}：读不到目录 ${directory === "" ? "(vault 根目录)" : directory}（${errorMessage(error)}）`
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
            errors.push(`${source.label}：读取 ${file} 失败（${errorMessage(error)}）`);
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
      path: "粘贴的控制台输出",
      text: pasted,
      sourceId: "pasted",
      sourceLabel: "粘贴的控制台输出",
      bytes: pasted.length,
      truncated: false,
    });
  }

  return { documents, sources, errors };
}
