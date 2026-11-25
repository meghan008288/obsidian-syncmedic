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
node scripts/check_fingerprints.ts --local-src DIR  # against another local copy
node scripts/check_fingerprints.ts --proxy http://127.0.0.1:7897
node scripts/check_fingerprints.ts --report drift-report.md
node scripts/check_fingerprints.ts --max-time 10 --retries 0
```

The exit codes tell the three outcomes apart:

| Exit code | Meaning | What the scheduled job does |
| --- | --- | --- |
| 0 | Every fingerprint was looked at and none of them moved | nothing |
| 1 | A fingerprint really moved | opens or updates an issue |
| 2 | The upstream could not be read at all | fails the job, opens no issue |

Exit 2 exists because a machine that cannot reach GitHub is not the same thing
as an upstream that rewrote a message. The last line of the report spells the
outcome out as `RESULT: no-drift`, `RESULT: drift` or `RESULT: unverifiable`.

The check works on Windows and on Linux: `scripts/http.ts` picks `curl.exe` or
`curl` depending on the platform, reads the HTTP status back from the
response, and treats a missing upstream file as a broken anchor rather than
as a network problem.

## The scheduled check

`.github/workflows/fingerprint-drift.yml` runs every Monday and on demand. When
a fingerprint drifted it opens (or comments on) an issue titled
"Fingerprint drift detected" with the full report attached, so the breakage
shows up in the issue tracker instead of in a user's log. A check that could
not be completed fails the job with the report in the job summary and opens no
issue, so a broken network never looks like an upstream change.

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
