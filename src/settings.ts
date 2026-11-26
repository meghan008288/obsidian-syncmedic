/**
 * Plugin settings.
 *
 * Kept free of any Obsidian import so the normalisation logic can be unit
 * tested on its own.
 */

export interface SyncMedicSettings {
  /** Run a scan automatically when the plugin loads. */
  scanOnStartup: boolean;
  /** Maximum number of characters read from one log file. */
  maxBytesPerFile: number;
  /** Maximum number of log files collected per run. */
  maxFiles: number;
  /** Show the evidence lines in the report. */
  includeEvidence: boolean;
}

export const DEFAULT_SETTINGS: SyncMedicSettings = {
  scanOnStartup: false,
  maxBytesPerFile: 2_000_000,
  maxFiles: 50,
  includeEvidence: true,
};

/** Kept in sync with manifest.json. */
export const PLUGIN_VERSION = "0.1.9";

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number, min: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value < min) return fallback;
  return Math.floor(value);
}

export function normalizeSettings(raw: unknown): SyncMedicSettings {
  if (typeof raw !== "object" || raw === null) {
    return { ...DEFAULT_SETTINGS };
  }
  const input = raw as Record<string, unknown>;
  return {
    scanOnStartup: asBoolean(input.scanOnStartup, DEFAULT_SETTINGS.scanOnStartup),
    maxBytesPerFile: asNumber(
      input.maxBytesPerFile,
      DEFAULT_SETTINGS.maxBytesPerFile,
      1024
    ),
    maxFiles: asNumber(input.maxFiles, DEFAULT_SETTINGS.maxFiles, 1),
    includeEvidence: asBoolean(
      input.includeEvidence,
      DEFAULT_SETTINGS.includeEvidence
    ),
  };
}
