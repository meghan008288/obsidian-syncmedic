/**
 * Where every rule's fingerprint comes from upstream.
 *
 * The rules match text that the upstream plugins (or the browser, or a third
 * party API) print. When an upstream project rewrites a message, the rule
 * silently stops matching and users get "no known problem" instead of a
 * diagnosis. Nothing in the plugin can notice that on its own, so every
 * fingerprint is pinned here to the exact upstream place it came from.
 *
 * Three anchor kinds:
 *
 *   "source"   the message is produced by the upstream plugin's own code, so
 *              it is pinned to a file in the upstream repository. The checker
 *              reads the file from the upstream default branch, which means a
 *              rewrite is caught as soon as it is committed, not only when a
 *              release ships.
 *
 *   "issue"    the message was reported by a user, so it is pinned to the
 *              upstream issue where it was reported. The checker reads the
 *              issue body and its comments.
 *
 *   "external" the message does not come from the upstream project at all.
 *              It comes from the browser, from Obsidian's own HTTP helper or
 *              from a third party API (Microsoft Graph, for example). There is
 *              nothing upstream to watch, so the checker reports it and never
 *              fails on it. The reason says where it really comes from.
 *
 * "legacy" means the upstream stopped emitting the message (the code is
 * commented out now), but the rule still matches logs written by older
 * versions. The checker reports those without failing, so the rule can be
 * retired on purpose later.
 *
 * A rule has one anchor per fingerprint, so every single string the rule
 * matches is watched. The checker reports the rule as drifted only when every
 * one of its upstream fingerprints is gone.
 */

export type AnchorKind = "source" | "issue" | "external";

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
   * of upstream code the fix steps point at. Required for "external" anchors.
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

const GRAPH = "Microsoft Graph API";

export const RULE_ANCHORS: Record<string, RuleAnchor[]> = {
  // OneDrive authorization refused (403).
  "RS-01": [
    {
      kind: "issue",
      project: "remotely-save",
      target: "11",
      literal: "Request failed, status 403",
      status: "active",
    },
    {
      kind: "external",
      project: "remotely-save",
      target: GRAPH,
      literal: "invalidAuthenticationToken",
      reason: "the code is returned by the Microsoft Graph API, not by the plugin",
      status: "active",
    },
    {
      kind: "external",
      project: "remotely-save",
      target: GRAPH,
      literal: "unauthenticated_client",
      reason: "the code is returned by the Microsoft Graph API, not by the plugin",
      status: "active",
    },
    {
      kind: "external",
      project: "remotely-save",
      target: GRAPH,
      literal: "Access token has expired",
      reason: "the message is returned by the Microsoft Graph API, not by the plugin",
      status: "active",
    },
    {
      kind: "issue",
      project: "remotely-save",
      target: "11",
      literal: "Access denied",
      status: "active",
    },
  ],
  // OneDrive rate limited (429).
  "RS-02": [
    {
      kind: "issue",
      project: "remotely-save",
      target: "1121",
      literal: "Request failed, status 429",
      status: "active",
    },
    {
      kind: "issue",
      project: "remotely-save",
      target: "1121",
      literal: "Too Many Requests",
      status: "active",
    },
  ],
  // Graph API refuses conflictBehavior on a folder.
  "RS-03": [
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsOnedrive.ts",
      literal: "@microsoft.graph.conflictBehavior",
      status: "active",
    },
    {
      kind: "issue",
      project: "remotely-save",
      target: "1170",
      literal: "400 Bad Request",
      status: "active",
    },
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsOnedrive.ts",
      literal: "graph.microsoft.com",
      status: "active",
    },
    {
      kind: "issue",
      project: "remotely-save",
      target: "1170",
      literal: "Microsoft Graph",
      status: "active",
    },
    {
      kind: "issue",
      project: "remotely-save",
      target: "1170",
      literal: "Graph API",
      status: "active",
    },
  ],
  // WebDAV refuses the write.
  "RS-04": [
    {
      kind: "issue",
      project: "remotely-save",
      target: "986",
      literal: "405 Method not allowed",
      status: "active",
    },
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsWebdav.ts",
      literal: "we fail to write file partially",
      status: "active",
    },
  ],
  // The sync was aborted because too many files would change.
  "RS-05": [
    {
      kind: "source",
      project: "remotely-save",
      target: "src/langs/en.json",
      literal: "you set changing files",
      status: "active",
    },
    {
      kind: "source",
      project: "remotely-save",
      target: "src/langs/en.json",
      literal: "is going to be modified or deleted",
      status: "active",
    },
  ],
  // The network dropped while the plugin was talking to the server.
  "RS-06": [
    {
      kind: "issue",
      project: "remotely-save",
      target: "732",
      literal: "net::ERR_NETWORK_IO_SUSPENDED",
      status: "active",
    },
    {
      kind: "issue",
      project: "remotely-save",
      target: "732",
      literal: "net::ERR_TIMED_OUT",
      status: "active",
    },
    {
      kind: "external",
      project: "remotely-save",
      target: "Chromium network stack",
      literal: "net::ERR_NETWORK_CHANGED",
      reason:
        "the code comes from Chromium, so it is not in the plugin's source and cannot be watched upstream",
      status: "active",
    },
  ],
  // A remote file could not be deleted or moved.
  "RS-07": [
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsDropbox.ts",
      literal: "some error while deleting",
      status: "active",
    },
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsDropbox.ts",
      literal: "some error while moving",
      status: "active",
    },
  ],
  // The local sync database is locked or was deleted.
  "RS-08": [
    {
      kind: "source",
      project: "remotely-save",
      target: "src/localdb.ts",
      literal: "trying to delete db but it was blocked",
      status: "active",
    },
    {
      kind: "source",
      project: "remotely-save",
      target: "src/localdb.ts",
      literal: "db deleted",
      status: "active",
    },
  ],
  // The end-to-end encryption worker. Every fingerprint below is text that
  // the upstream 0.5.25 release really prints, and every one of them carries
  // its own pin so a rewrite of any of them is noticed.
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
  // The OneDrive token refresh hangs.
  "RS-10": [
    {
      kind: "issue",
      project: "remotely-save",
      target: "11",
      literal: "Request failed, status 403",
      status: "active",
    },
    {
      kind: "issue",
      project: "remotely-save",
      target: "11",
      literal: "Access denied",
      status: "active",
    },
    {
      kind: "external",
      project: "remotely-save",
      target: GRAPH,
      literal: "invalidAuthenticationToken",
      reason: "the code is returned by the Microsoft Graph API, not by the plugin",
      status: "active",
    },
    {
      kind: "external",
      project: "remotely-save",
      target: GRAPH,
      literal: "unauthenticated_client",
      reason: "the code is returned by the Microsoft Graph API, not by the plugin",
      status: "active",
    },
    {
      kind: "external",
      project: "remotely-save",
      target: GRAPH,
      literal: "Access token has expired",
      reason: "the message is returned by the Microsoft Graph API, not by the plugin",
      status: "active",
    },
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsOnedrive.ts",
      literal: "updating local info of OneDrive token",
      status: "active",
    },
    {
      kind: "source",
      project: "remotely-save",
      target: "src/baseTypes.ts",
      literal: "remotely-save-cb-onedrive",
      reason:
        "the error text itself comes from the Microsoft Graph API, so this anchor is the OneDrive callback URL the fix steps point at",
      status: "active",
    },
  ],
  // The connection self-check failed.
  "RS-11": [
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsAll.ts",
      literal: "check connect: delete file",
      status: "active",
    },
    {
      kind: "source",
      project: "remotely-save",
      target: "src/fsAll.ts",
      literal: "check connect: delete folder",
      status: "active",
    },
  ],
  // The CORS preflight of the LiveSync server failed.
  "LS-01": [
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "588",
      literal: "The preflight fetch failed with a CORS Error",
      status: "active",
    },
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "588",
      literal: "No Content available for preflight request",
      status: "active",
    },
  ],
  // The sync was cancelled because the fetch failed.
  "LS-02": [
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "588",
      literal: "Synchronisation has been cancelled with the message",
      status: "active",
    },
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "588",
      literal: "Failed to fetch",
      status: "active",
    },
  ],
  // The server answered with an HTML page instead of JSON.
  "LS-03": [
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "588",
      literal: "Unexpected token '",
      status: "active",
    },
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "588",
      literal: "is not valid JSON",
      status: "active",
    },
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "588",
      literal: "DOCTYPE",
      status: "active",
    },
  ],
  // The clients do not agree on the configuration.
  "LS-04": [
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "606",
      literal: "Configuration mismatching between the clients",
      status: "active",
    },
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "606",
      literal: "checking configuration failed",
      status: "active",
    },
  ],
  // The chunks could not be read from the database.
  "LS-05": [
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "505",
      literal: "Exception raised while retrieving chunks",
      status: "active",
    },
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "505",
      literal: "CollectChunksInternal",
      status: "active",
    },
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "505",
      literal: "File not found on database",
      status: "active",
    },
  ],
  // The database is locked.
  "LS-06": [
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/apps/cli/commands/runCommand.ts",
      literal: "Please unlock the database from the Obsidian plugin",
      status: "active",
    },
  ],
  // The TLS handshake failed.
  "LS-07": [
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "37",
      literal: "handshake failed",
      status: "active",
    },
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "37",
      literal: "SSL error code",
      status: "active",
    },
    {
      kind: "issue",
      project: "obsidian-livesync",
      target: "37",
      literal: "net_error",
      status: "active",
    },
  ],
  // The remote configuration could not be read.
  "LS-08": [
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/modules/features/SettingDialogue/PaneRemoteConfig.ts",
      literal: "Failed to parse remote configuration",
      status: "active",
    },
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/modules/features/SettingDialogue/PaneRemoteConfig.ts",
      literal: "Failed to import remote configuration",
      status: "active",
    },
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/serviceFeatures/redFlag.ts",
      literal: "Failed to activate remote configuration",
      status: "active",
    },
  ],
  // A file needs a manual merge.
  "LS-09": [
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/serviceFeatures/conflictResolution/checker.ts",
      literal: "merging process has been postponed",
      status: "active",
    },
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/serviceFeatures/conflictResolution/operations.ts",
      literal: "Manual merge required",
      status: "active",
    },
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/serviceFeatures/conflictResolution/operations.ts",
      literal: "some conflicts are left in",
      status: "active",
    },
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/serviceFeatures/conflictResolution/operations.ts",
      literal: "conflict(s) found:",
      status: "active",
    },
  ],
  // Deleted files are still in the database.
  "LS-10": [
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/features/LocalDatabaseMainte/CmdLocalDatabaseMainte.ts",
      literal: "deleted files",
      status: "active",
    },
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/features/LocalDatabaseMainte/CmdLocalDatabaseMainte.ts",
      literal: "Searching for deleted files",
      status: "active",
    },
  ],
  // The vault could not be initialised.
  "LS-11": [
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/serviceFeatures/redFlag.ts",
      literal: "Error during vault initialisation",
      status: "active",
    },
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/serviceFeatures/redFlag.ts",
      literal: "Rebuild everything cancelled by user",
      status: "active",
    },
    {
      kind: "source",
      project: "obsidian-livesync",
      target: "src/serviceFeatures/replication/applyReplicatedDocument.ts",
      literal: "Invalid path",
      status: "active",
    },
  ],
};
