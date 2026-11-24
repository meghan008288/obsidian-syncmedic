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
    header.createEl("h3", { text: "SyncMedic 同步体检报告" });
    header.createEl("p", {
      cls: "syncmedic-report-summary",
      text: this.result.summary,
    });

    const actions = contentEl.createDiv({ cls: "syncmedic-report-actions" });

    const copyButton = actions.createEl("button", {
      text: "复制报告（可直接贴到 issue）",
      cls: "mod-cta",
    });
    copyButton.addEventListener("click", () => {
      void navigator.clipboard.writeText(this.result.markdown).then(
        () => new Notice("报告已复制到剪贴板"),
        () => new Notice("复制失败，请手动选择文本复制")
      );
    });

    const exportButton = actions.createEl("button", { text: "导出为笔记" });
    exportButton.addEventListener("click", () => {
      void this.plugin.exportReport(this.result);
    });

    const jsonButton = actions.createEl("button", { text: "复制 JSON" });
    jsonButton.addEventListener("click", () => {
      void navigator.clipboard.writeText(this.result.json).then(
        () => new Notice("JSON 已复制到剪贴板"),
        () => new Notice("复制失败，请手动选择文本复制")
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
    footer.createEl("button", { text: "关闭", cls: "mod-cta" }).addEventListener(
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

    contentEl.createEl("h3", { text: "粘贴控制台日志" });
    contentEl.createEl("p", {
      cls: "syncmedic-hint",
      text:
        "在 Obsidian 里按 Ctrl+Shift+I（macOS 是 Cmd+Option+I）打开开发者控制台，" +
        "把和同步故障相关的输出整段选中复制，粘贴到下面。内容只在本机解析，粘贴前会自动脱敏。",
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
      .createEl("button", { text: "开始体检", cls: "mod-cta" })
      .addEventListener("click", () => {
        const pasted = this.value;
        this.close();
        void this.plugin.runScan(pasted);
      });
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => {
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
      .setName("启动时自动体检")
      .setDesc("插件加载时自动扫描一次日志并弹出报告。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.scanOnStartup)
          .onChange(async (value) => {
            this.plugin.settings.scanOnStartup = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("报告里显示证据行")
      .setDesc("关闭后报告只给结论和修复步骤，不显示具体日志行。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeEvidence)
          .onChange(async (value) => {
            this.plugin.settings.includeEvidence = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("单个日志文件最多读取")
      .setDesc("单位：字符。超过这个长度的日志会被截断。")
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
      .setName("最多采集文件数")
      .setDesc("一次体检最多读取多少个日志文件。")
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
      .setName("托管修复服务地址")
      .setDesc("付费版「一键托管修复」调用的服务端地址。")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.serviceUrl)
          .onChange(async (value) => {
            this.plugin.settings.serviceUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("插件版本")
      .setDesc(`当前版本 ${PLUGIN_VERSION}`)
      .addButton((button) =>
        button.setButtonText("保存设置").onClick(async () => {
          await this.plugin.saveSettings();
          new Notice("SyncMedic 设置已保存");
        })
      );
  }
}

export type { SyncMedicSettings };
