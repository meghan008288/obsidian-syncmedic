/**
 * Bridge between the pure `VaultAdapter` interface and Obsidian.
 *
 * The official plugin guidelines ask us to prefer the Vault API over the
 * Adapter API, because the Vault API is cached and serialises writes.
 *
 * There is one hard exception: the configuration folder is not part of the
 * vault's file index, so the Vault API cannot see it at all. Plugin folders
 * such as `<configDir>/plugins/obsidian-livesync/` can therefore only be
 * reached through the Adapter API. Everything else goes through the Vault
 * API.
 *
 * The configuration folder is never hard-coded: the user can rename it, so it
 * is read from `vault.configDir` at runtime.
 */

import { TFile, TFolder, type App } from "obsidian";

import type { VaultAdapter } from "./logs.ts";

export class ObsidianAdapter implements VaultAdapter {
  private readonly app: App;
  /** Obsidian's configuration folder. The user can rename it. */
  readonly configDir: string;

  constructor(app: App) {
    this.app = app;
    this.configDir = app.vault.configDir;
  }

  /** Paths Obsidian keeps out of the vault index need the raw adapter. */
  private isHidden(path: string): boolean {
    return path === this.configDir || path.startsWith(`${this.configDir}/`);
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
    // getFolderByPath() only exists since Obsidian 1.5.7, which is newer than
    // the minAppVersion we declare, so we resolve the folder ourselves.
    const folder =
      path === ""
        ? this.app.vault.getRoot()
        : this.app.vault.getAbstractFileByPath(path);
    if (!(folder instanceof TFolder)) {
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
