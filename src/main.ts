import { Notice, Plugin } from "obsidian";

import { ObsidianAdapter } from "./obsidian-adapter.ts";
import { runDiagnostics, type RunOutput } from "./pipeline.ts";
import {
  DEFAULT_SETTINGS,
  PLUGIN_VERSION,
  normalizeSettings,
  type SyncMedicSettings,
} from "./settings.ts";
import {
  SyncMedicPasteModal,
  SyncMedicReportModal,
  SyncMedicSettingsTab,
} from "./ui.ts";

export default class SyncMedicPlugin extends Plugin {
  settings: SyncMedicSettings = { ...DEFAULT_SETTINGS };
  /** Result of the most recent run, kept so the report can be exported. */
  lastResult: RunOutput | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addRibbonIcon("stethoscope", "SyncMedic health check", () => {
      void this.runScan();
    });

    this.addCommand({
      id: "run-scan",
      name: "Run health check",
      callback: () => {
        void this.runScan();
      },
    });

    this.addCommand({
      id: "paste-console",
      name: "Paste console log and check",
      callback: () => {
        new SyncMedicPasteModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "export-report",
      name: "Export the last report to the vault",
      callback: () => {
        if (!this.lastResult) {
          new Notice("No report yet. Run a health check first.");
          return;
        }
        void this.exportReport(this.lastResult);
      },
    });

    this.addSettingTab(new SyncMedicSettingsTab(this.app, this));

    if (this.settings.scanOnStartup) {
      // Give Obsidian a moment to finish loading the vault before scanning.
      window.setTimeout(() => {
        void this.runScan(undefined, true);
      }, 2000);
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async runScan(pasted?: string, silent = false): Promise<void> {
    const notice = silent ? null : new Notice("SyncMedic is checking…", 0);
    try {
      const result = await runDiagnostics({
        adapter: new ObsidianAdapter(this.app),
        pasted,
        settings: this.settings,
        pluginVersion: PLUGIN_VERSION,
        vaultName: this.app.vault.getName(),
      });

      this.lastResult = result;

      if (result.analysis.matches.length === 0) {
        new Notice(result.summary);
      }
      new SyncMedicReportModal(this.app, this, result).open();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`SyncMedic failed: ${message}`, 8000);
    } finally {
      notice?.hide();
    }
  }

  async exportReport(result: RunOutput): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const path = `SyncMedic report ${stamp}.md`;
    try {
      await this.app.vault.create(path, result.markdown);
      new Notice(`Report exported: ${path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Export failed: ${message}`, 8000);
    }
  }
}
