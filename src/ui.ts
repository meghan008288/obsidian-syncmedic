import {
  App,
  Component,
  MarkdownRenderer,
  Modal,
  Notice,
  PluginSettingTab,
  Setting,
} from "obsidian";

import type { RunOutput } from "./pipeline.ts";
import type SyncMedicPlugin from "./main.ts";
import { PLUGIN_VERSION, type SyncMedicSettings } from "./settings.ts";

/** Shows the generated report. */
export class SyncMedicReportModal extends Modal {
  /** MarkdownRenderer needs a Component to attach its child views to. */
  private readonly renderer = new Component();

  constructor(
    app: App,
    private readonly plugin: SyncMedicPlugin,
    private readonly result: RunOutput
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("syncmedic-report");

    const header = contentEl.createDiv({ cls: "syncmedic-report-header" });
    header.createEl("h3", { text: "SyncMedic health check report" });
    header.createEl("p", {
      cls: "syncmedic-report-summary",
      text: this.result.summary,
    });

    const actions = contentEl.createDiv({ cls: "syncmedic-report-actions" });

    const copyButton = actions.createEl("button", {
      text: "Copy report (paste-ready for an issue)",
      cls: "mod-cta",
    });
    copyButton.addEventListener("click", () => {
      void navigator.clipboard.writeText(this.result.markdown).then(
        () => new Notice("Report copied to the clipboard"),
        () => new Notice("Copy failed, please select the text and copy it manually")
      );
    });

    const exportButton = actions.createEl("button", { text: "Export as note" });
    exportButton.addEventListener("click", () => {
      void this.plugin.exportReport(this.result);
    });

    const jsonButton = actions.createEl("button", { text: "Copy JSON" });
    jsonButton.addEventListener("click", () => {
      void navigator.clipboard.writeText(this.result.json).then(
        () => new Notice("JSON copied to the clipboard"),
        () => new Notice("Copy failed, please select the text and copy it manually")
      );
    });

    const body = contentEl.createDiv({ cls: "syncmedic-report-body" });
    void MarkdownRenderer.render(
      this.app,
      this.result.markdown,
      body,
      "",
      this.renderer
    );

    const footer = contentEl.createDiv({ cls: "syncmedic-report-footer" });
    footer.createEl("button", { text: "Close", cls: "mod-cta" }).addEventListener(
      "click",
      () => this.close()
    );
  }

  onClose(): void {
    this.renderer.unload();
    this.contentEl.empty();
  }
}

/** Lets the user paste the Obsidian developer console output. */
export class SyncMedicPasteModal extends Modal {
  private value = "";

  constructor(
    app: App,
    private readonly plugin: SyncMedicPlugin
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("syncmedic-paste");

    contentEl.createEl("h3", { text: "Paste console log" });
    contentEl.createEl("p", {
      cls: "syncmedic-hint",
      text:
        "Press Ctrl+Shift+I (Cmd+Option+I on macOS) in Obsidian to open the developer console, " +
        "select the output related to the sync failure, copy it, and paste it below. The content is parsed locally only, and it is redacted before anything else happens.",
    });

    const textarea = contentEl.createEl("textarea", {
      cls: "syncmedic-paste-input",
    });
    textarea.placeholder =
      "plugin:remotely-save:234 Error: Request failed, status 403";
    textarea.value = this.value;
    textarea.addEventListener("input", () => {
      this.value = textarea.value;
    });

    const actions = contentEl.createDiv({ cls: "syncmedic-paste-actions" });
    actions
      .createEl("button", { text: "Run health check", cls: "mod-cta" })
      .addEventListener("click", () => {
        const pasted = this.value;
        this.close();
        void this.plugin.runScan(pasted);
      });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => {
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Settings pane. */
export class SyncMedicSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: SyncMedicPlugin
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Run a health check on startup")
      .setDesc("Scan the logs once when the plugin loads and open the report.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.scanOnStartup)
          .onChange(async (value) => {
            this.plugin.settings.scanOnStartup = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show evidence lines in the report")
      .setDesc("When off, the report only gives the conclusion and the fix steps, without the actual log lines.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeEvidence)
          .onChange(async (value) => {
            this.plugin.settings.includeEvidence = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Maximum characters read per log file")
      .setDesc("Unit: characters. Logs longer than this are truncated.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.maxBytesPerFile))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
              this.plugin.settings.maxBytesPerFile = parsed;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Maximum number of files collected")
      .setDesc("How many log files one health check may read.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.maxFiles))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
              this.plugin.settings.maxFiles = parsed;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Plugin version")
      .setDesc(`Current version ${PLUGIN_VERSION}`)
      .addButton((button) =>
        button.setButtonText("Save settings").onClick(async () => {
          await this.plugin.saveSettings();
          new Notice("SyncMedic settings saved");
        })
      );
  }
}

export type { SyncMedicSettings };
