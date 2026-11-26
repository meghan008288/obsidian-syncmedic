/**
 * Where every rule's fingerprint comes from upstream.
 *
 * The rules match text that the upstream plugins (or the browser, or a third
 * party API) print. When an upstream project rewrites a message, the rule
 * silently stops matching and users get "no known problem" instead of a
 * diagnosis. Nothing in the plugin can notice that on its own, so every
 * fingerprint is pinned here to the exact upstream place it came from.
 *
 * Two anchor kinds:
 *
 *   "source" the message is produced by the upstream plugin's own code, so it
 *            is pinned to a file in the upstream repository. The checker reads
 *            the file from the upstream default branch, which means a rewrite
 *            is caught as soon as it is committed, not only when a release
 *            ships.
 *
 *   "issue"  the message was reported by a user, so it is pinned to the
 *            upstream issue where it was reported. The checker reads the issue
 *            body and its comments.
 *
 * "legacy" means the upstream stopped emitting the message (the code is
 * commented out now), but the rule still matches logs written by older
 * versions. The checker reports those without failing, so the rule can be
 * retired on purpose later.
 *
 * A rule may have more than one anchor. That is what a rule needs when its
 * fingerprints come from several places in the upstream project: each
 * fingerprint then carries its own pin, and the checker reports the rule as
 * drifted only when every one of its fingerprints is gone. A rule with a
 * single anchor keeps the old behaviour: when that one fingerprint moves,
 * the rule is reported.
 */

export type AnchorKind = "source" | "issue";

export interface RuleAnchor {
  kind: AnchorKind;
  /** Upstream project the message belongs to. */
  project: "remotely-save" | "obsidian-livesync";
  /** File inside the upstream repository, or the issue number as a string. */
  target: string;
  /** The text that has to still be there. */
  literal: string;
  /**
   * Set when the literal is not part of the fingerprint itself but the piece
   * of upstream code the fix steps point at.
   */
  reason?: string;
  status: "active" | "legacy";
}

export interface UpstreamProject {
  /** GitHub "owner/repo". */
  repo: string;
  /** Branch the source anchors are read from. */
  branch: string;
  /** Upstream release the anchors were last verified against. */
  verifiedAt: string;
}

export const UPSTREAM_PROJECTS: Record<string, UpstreamProject> = {
  "remotely-save": {
    repo: "remotely-save/remotely-save",
    branch: "master",
    verifiedAt: "0.5.25",
  },
  "obsidian-livesync": {
    repo: "vrtmrz/obsidian-livesync",
    branch: "main",
    verifiedAt: "1.0.52",
  },
};

export const RULE_ANCHORS: Record<string, RuleAnchor[]> = {
  "RS-01": [
    {
      kind: "issue",
      project: "remotely-save",
      target: "11",
      literal: "Access denied",
      status: "active",
    },
  ],
  "RS-02": [
    {
      kind: "issue",
      project: "remotely-save",
      target: "1121",
      literal: "Too Many Requests",
      status: "active",
    },
  ],
  "RS-03": [
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsOnedrive.ts",
      literal: "@microsoft.graph.conflictBehavior",
      status: "active",
    },
  ],
  "RS-04": [
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsWebdav.ts",
      literal: "we fail to write file partially",
      status: "active",
    },
  ],
  "RS-05": [
    {
      kind: "source",
      project: "remotely-save",
      target: "src/langs/en.json",
      literal: "you set changing files",
      status: "active",
    },
  ],
  "RS-06": [
    {
      kind: "issue",
      project: "remotely-save",
      target: "732",
      literal: "net::ERR_NETWORK_IO_SUSPENDED",
      status: "active",
    },
  ],
  "RS-07": [
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsDropbox.ts",
      literal: "some error while deleting",
      status: "active",
    },
  ],
  "RS-08": [
    {
      kind: "source",
      project: "remotely-save",
      target: "src/localdb.ts",
      literal: "trying to delete db but it was blocked",
      status: "active",
    },
  ],
  // The end-to-end encryption worker. Every fingerprint below is text that
  // the upstream 0.5.25 release really prints, and every one of them carries
  // its own pin, so a rewrite of any of them is noticed.
  //
  // The previous fingerprints of this rule were "main: receiving error in
  // ...". Those lines only ever existed as commented out console.debug calls:
  // the file was created that way in 2024 (commit e283efc8 "new encryption")
  // and the string is in none of the shipped releases, so the rule could
  // never fire. It was reported as "legacy" instead of being repaired.
  "RS-09": [
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsEncrypt.ts",
      literal: "cannot encrypt name=",
      status: "active",
    },
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsEncrypt.ts",
      literal: "cannot encrypt content",
      status: "active",
    },
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsEncrypt.ts",
      literal: "cannot decrypt name=",
      status: "active",
    },
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsEncrypt.ts",
      literal: "cannot decrypt content",
      status: "active",
    },
    {
      kind: "source",
      project: "remotely-save",
      target: "src/encryptRClone.ts",
      literal: "unknown outputName after encryptNameByCallingWorker",
      status: "active",
    },
    {
      kind: "source",
      project: "remotely-save",
      target: "src/encryptRClone.ts",
      literal: "unknown outputContent after encryptContentByCallingWorker",
      status: "active",
    },
    {
      kind: "source",
      project: "remotely-save",
      target: "src/encryptRClone.ts",
      literal: "error after prepareByCallingWorker",
      status: "active",
    },
  ],
  "RS-10": [
    {
      kind: "source",
      project: "remotely-save",
      target: "src/baseTypes.ts",
      literal: "remotely-save-cb-onedrive",
      reason:
        "the error text itself comes from the Microsoft Graph API, so the anchor is the OneDrive callback URL the fix steps point at",
      status: "active",
    },
  ],
  "RS-11": [
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsAll.ts",
      literal: "check connect: delete file",
      status: "active",
    },
  ],
  "LS-01": [
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "588",
      literal: "The preflight fetch failed with a CORS Error",
      status: "active",
    },
  ],
  "LS-02": [
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "588",
      literal: "Synchronisation has been cancelled with the message",
      status: "active",
    },
  ],
  "LS-03": [
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "588",
      literal: "is not valid JSON",
      status: "active",
    },
  ],
  "LS-04": [
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "606",
      literal: "Configuration mismatching between the clients",
      status: "active",
    },
  ],
  "LS-05": [
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "505",
      literal: "Exception raised while retrieving chunks",
      status: "active",
    },
  ],
  "LS-06": [
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/apps/cli/commands/runCommand.ts",
      literal: "Please unlock the database from the Obsidian plugin",
      status: "active",
    },
  ],
  "LS-07": [
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "37",
      literal: "handshake failed",
      status: "active",
    },
  ],
  "LS-08": [
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/modules/features/SettingDialogue/PaneRemoteConfig.ts",
      literal: "Failed to parse remote configuration",
      status: "active",
    },
  ],
  "LS-09": [
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/serviceFeatures/conflictResolution/checker.ts",
      literal: "merging process has been postponed",
      status: "active",
    },
  ],
  "LS-10": [
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/features/LocalDatabaseMainte/CmdLocalDatabaseMainte.ts",
      literal: "Searching for deleted files",
      status: "active",
    },
  ],
  "LS-11": [
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/serviceFeatures/redFlag.ts",
      literal: "Error during vault initialisation",
      status: "active",
    },
  ],
};
