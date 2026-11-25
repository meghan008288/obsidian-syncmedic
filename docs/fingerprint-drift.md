# Fingerprint drift detection

Every rule in `src/rules.ts` matches text that an upstream project prints:

- **Remotely Save** (`meghan008288/obsidian-syncmedic` upstream is
  `remotely-save/remotely-save`) and **Self-hosted LiveSync**
  (`vrtmrz/obsidian-livesync`).

When an upstream project rewrites a message, the rule silently stops
matching. The plugin then reports "no known failure signature matched" for a
log that clearly contains a failure, and the user gets no diagnosis at all.
Nothing inside the plugin can notice that on its own, so every fingerprint is
pinned to the exact upstream place it came from.

## How it works

`src/rule-anchors.ts` holds one anchor per rule:

```ts
export interface RuleAnchor {
  kind: "source" | "issue";
  project: "remotely-save" | "obsidian-livesync";
  /** File inside the upstream repository, or the issue number. */
  target: string;
  /** The text that has to still be there. */
  literal: string;
  /** Set when the literal is not part of the fingerprint itself. */
  reason?: string;
  status: "active" | "legacy";
}
```

- `kind: "source"` — the message is produced by the upstream plugin's own
  code, so it is pinned to a file. The checker reads that file from the
  upstream **default branch**, which means a rewrite is caught as soon as it
  is committed, not only when a release ships.
- `kind: "issue"` — the message was reported by a user, so it is pinned to the
  upstream issue where it was reported. The checker reads the issue body **and
  its comments**, because the error output usually lives in a comment.
- `status: "legacy"` — the upstream stopped emitting the message (the code is
  commented out now), but the rule still matches logs from older versions.
  These are reported, not failed, so the rule can be retired on purpose.

Both sides of the comparison are canonicalised the same way: template holes
(`${...}`) and number runs collapse to `#`, so the source literal
`Request failed, status ${status}` still matches a fingerprint written as
`Request failed, status 403`.

## Running it

```bash
npm run check:fingerprints                    # against the live upstream
node scripts/check_fingerprints.ts --offline  # against the local _src copies
node scripts/check_fingerprints.ts --proxy http://127.0.0.1:7897
node scripts/check_fingerprints.ts --report drift-report.md
```

The exit code is 1 when an active anchor drifted, so CI can fail on it.

## The scheduled check

`.github/workflows/fingerprint-drift.yml` runs every Monday and on demand. When
a fingerprint drifted it opens (or comments on) an issue titled
"Fingerprint drift detected" with the full report attached, so the breakage
shows up in the issue tracker instead of in a user's log.

## What to do when it reports a drift

1. Open the upstream file or issue it names and read what the message became.
2. If the upstream still prints something equivalent, update the fingerprint in
   `src/rules.ts` **and** the anchor in `src/rule-anchors.ts`.
3. If the upstream removed the failure mode, delete the rule and its anchor.
4. Bump `UPSTREAM_PROJECTS[...].verifiedAt` to the release you verified
   against.

## Known legacy rule

`RS-09` (the end-to-end encryption worker) is marked `legacy`: the upstream
commented those `console.debug` calls out, so `remotely-save` 0.5.25 no longer
prints them. The rule still matches logs written by older versions.
