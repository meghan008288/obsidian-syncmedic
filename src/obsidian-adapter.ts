/**
 * Bridge between the pure `VaultAdapter` interface and Obsidian.
 *
 * The official plugin guidelines ask us to prefer the Vault API over the
 * Adapter API, because the Vault API is cached and serialises writes.
 *
 * There is one hard exception: `.obsidian/` is not part of the vault's file
 * index, so the Vault API cannot see it at all. Plugin folders such as
 * `.obsidian/plugins/obsidian-livesync/` can therefore only be reached
 * through the Adapter API. Everything else goes through the Vault API.
 */

import { TFile, TFolder, type App } from "obsidian";

import type { VaultAdapter } from "./logs.ts";

const HIDDEN_PREFIX = ".obsidian/";

export class ObsidianAdapter implements VaultAdapter {
  private readonly app: App;

  constructor(app: App) {
    this.app = app;
  }

  /** Paths Obsidian keeps out of the vault index need the raw adapter. */
  private isHidden(path: string): boolean {
    return path === ".obsidian" || path.startsWith(HIDDEN_PREFIX);
  }

  async exists(path: string): Promise<boolean> {
    if (this.isHidden(path)) {
      return this.app.vault.adapter.exists(path);
    }
    return this.app.vault.getAbstractFileByPath(path) !== null;
  }

  async read(path: string): Promise<string> {
    if (this.isHidden(path)) {
      return this.app.vault.adapter.read(path);
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`not a file: ${path}`);
    }
    return this.app.vault.read(file);
  }

  async list(path: string): Promise<{ files: string[]; folders: string[] }> {
    if (this.isHidden(path)) {
      return this.app.vault.adapter.list(path);
    }
    const folder =
      path === "" ? this.app.vault.getRoot() : this.app.vault.getFolderByPath(path);
    if (!folder) {
      throw new Error(`no such folder: ${path}`);
    }
    const files: string[] = [];
    const folders: string[] = [];
    for (const child of folder.children) {
      if (child instanceof TFile) files.push(child.path);
      else if (child instanceof TFolder) folders.push(child.path);
    }
    return { files, folders };
  }
}
