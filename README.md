# SyncMedic

A local health check for sync failures. It finds your sync logs inside your
vault, matches them against **22 failure signatures taken from real upstream
issues and from the plugins' own source code**, and tells you what went wrong
and exactly how to fix it.

- **Supports Remotely Save and Self-hosted LiveSync.**
- **Nothing leaves your machine.** Logs are parsed locally; the plugin contains
  no network calls and no telemetry.
- **Safe to paste.** Tokens, passwords, e-mails and local paths are redacted
  before the report is rendered, so you can paste the report straight into a
  public GitHub issue.
- **The report is the fix.** Every finding links back to the upstream issue
  where the same failure was reported, and lists the concrete steps to resolve
  it.

[中文文档](./README.zh-CN.md)

---

## What this does

When sync breaks, the console is full of lines like this:

```
plugin:remotely-save:234 Error: Request failed, status 403
```

Then you have to go dig through hundreds of GitHub issues yourself, guessing
"is this one mine?"

SyncMedic turns that into one step:

1. It collects the relevant logs from your vault (no network, no upload)
2. It compares them against **22 real failure signatures**, each one taken from
   the upstream repositories' source code or from a real error message a user
   pasted into an issue
3. It hands you a report you can paste straight into a GitHub issue: which rule
   matched, which line of evidence, how to fix it, and a link to the upstream
   issue

Every sensitive value in the report (tokens, passwords, e-mails, paths) **has
already been replaced before the report is generated**, so you can copy and
paste the whole thing without thinking about it.

---

## Three steps

**Step 1: get the logs in place**

SyncMedic looks in these places on its own, and takes whatever it finds:

| Source | Where | How to get it |
| --- | --- | --- |
| LiveSync log | `livesync_log_*` in the vault root | Turn on **Write logs into the file** in the LiveSync settings |
| Remotely Save debug export | `_debug_remotely_save/` in the vault | Export the log history with the Remotely Save debug export |
| Logstravaganza note | `LOGGING-NOTE*.md` in the vault root | Install the Logstravaganza plugin (the approach the Remotely Save docs recommend on iOS) |
| `.log` files in the plugin folder | `<configDir>/plugins/*/` | Upstream occasionally writes them to disk |

> **Note: Remotely Save does not write log files of its own.** It only prints
> to the Obsidian console. So either use its debug export, or paste the console
> output in directly.

**Step 2: run the check**

- Command palette → `SyncMedic: Run health check`
- Or click the stethoscope icon in the ribbon
- If nothing was found → `SyncMedic: Paste console log and check`, then paste the
  relevant console output in one go

**Step 3: take the report**

The report dialog has three buttons:

- **Copy report** — paste it into a GitHub issue, already redacted
- **Export as note** — save it as a markdown note in your vault
- **Copy JSON** — for scripts

---

## Privacy

- **Logs are parsed on your machine only** and are never sent to a server.
  There is no network request and no telemetry in the code.
- Redaction happens **before matching**: secrets are replaced with
  `[REDACTED:xxx]` first, and only then is the text compared against the
  failure signatures. The signatures match on the structure around an error,
  not on the secret itself, so redaction never breaks a match.
- The report is redacted once more when it is rendered (defence in depth).

---

## The 22 failure signatures

Every signature has a source: **"From an upstream issue"** means the string was
copied from a real error message a user pasted into an upstream issue;
**"Confirmed in the source"** means the string really exists in the released
source code of the plugin.

| ID | Plugin | Severity | Problem | Signature source | Upstream issue |
| --- | --- | --- | --- | --- | --- |
| `RS-01` | Remotely Save | Critical | OneDrive authorization refused (403): the token expired or the permission was never granted | From an upstream issue | [#11](https://github.com/remotely-save/remotely-save/issues/11) [#920](https://github.com/remotely-save/remotely-save/issues/920) |
| `RS-02` | Remotely Save | Warning | OneDrive 429 rate limit: too many requests too fast | From an upstream issue | [#1121](https://github.com/remotely-save/remotely-save/issues/1121) |
| `RS-03` | Remotely Save | Critical | Graph API 400: `conflictBehavior: replace` was used on a folder | From an upstream issue | [#1170](https://github.com/remotely-save/remotely-save/issues/1170) |
| `RS-04` | Remotely Save | Critical | WebDAV 405 Method Not Allowed: the config folder or a special file name cannot be written | Confirmed in the source | [#986](https://github.com/remotely-save/remotely-save/issues/986) |
| `RS-05` | Remotely Save | Critical | The change ratio exceeded the limit, so the sync was aborted on purpose | From an upstream issue | [#945](https://github.com/remotely-save/remotely-save/issues/945) |
| `RS-06` | Remotely Save | Warning | Network hiccup caused ERR_NETWORK_IO_SUSPENDED | From an upstream issue | [#732](https://github.com/remotely-save/remotely-save/issues/732) |
| `RS-07` | Remotely Save | Warning | Deleting or moving a remote file failed | Confirmed in the source | [#991](https://github.com/remotely-save/remotely-save/issues/991) |
| `RS-08` | Remotely Save | Warning | The local sync database is locked or was deleted | Confirmed in the source | [#1151](https://github.com/remotely-save/remotely-save/issues/1151) |
| `RS-09` | Remotely Save | Critical | The end-to-end encryption worker failed to encrypt or decrypt the file | Confirmed in the source | [#843](https://github.com/remotely-save/remotely-save/issues/843) |
| `RS-10` | Remotely Save | Critical | Refreshing the OneDrive token hangs, the connection stays on "Connecting to OneDrive" | From an upstream issue | [#11](https://github.com/remotely-save/remotely-save/issues/11) [#920](https://github.com/remotely-save/remotely-save/issues/920) |
| `RS-11` | Remotely Save | Hint | The remote connection self-check did not pass | Confirmed in the source | [#840](https://github.com/remotely-save/remotely-save/issues/840) |
| `LS-01` | LiveSync | Critical | The CORS preflight failed: the server does not allow OPTIONS requests | From an upstream issue | [#588](https://github.com/vrtmrz/obsidian-livesync/issues/588) |
| `LS-02` | LiveSync | Critical | The sync was cancelled: TypeError: Failed to fetch | From an upstream issue | [#588](https://github.com/vrtmrz/obsidian-livesync/issues/588) |
| `LS-03` | LiveSync | Critical | The server did not return JSON (most likely a login page) | From an upstream issue | [#588](https://github.com/vrtmrz/obsidian-livesync/issues/588) |
| `LS-04` | LiveSync | Warning | The client configuration is inconsistent | From an upstream issue | [#606](https://github.com/vrtmrz/obsidian-livesync/issues/606) |
| `LS-05` | LiveSync | Critical | Chunk collection failed: the file is not in the database | From an upstream issue | [#505](https://github.com/vrtmrz/obsidian-livesync/issues/505) |
| `LS-06` | LiveSync | Critical | The database is not unlocked | Confirmed in the source | [#815](https://github.com/vrtmrz/obsidian-livesync/issues/815) |
| `LS-07` | LiveSync | Critical | The SSL handshake fails on Android | From an upstream issue | [#37](https://github.com/vrtmrz/obsidian-livesync/issues/37) |
| `LS-08` | LiveSync | Warning | The remote configuration could not be parsed or imported | Confirmed in the source | [#606](https://github.com/vrtmrz/obsidian-livesync/issues/606) |
| `LS-09` | LiveSync | Warning | A file conflict is unresolved and has to be merged by hand | Confirmed in the source | [#151](https://github.com/vrtmrz/obsidian-livesync/issues/151) [#813](https://github.com/vrtmrz/obsidian-livesync/issues/813) |
| `LS-10` | LiveSync | Warning | The database still holds deleted files, which may come back | Confirmed in the source | [#151](https://github.com/vrtmrz/obsidian-livesync/issues/151) [#813](https://github.com/vrtmrz/obsidian-livesync/issues/813) |
| `LS-11` | LiveSync | Critical | A rebuild or an initialisation was interrupted | Confirmed in the source | [#762](https://github.com/vrtmrz/obsidian-livesync/issues/762) |

The fix steps live in `src/rules.ts`, and every one of them is written as an
action you can carry out, not as "check your network".

---

## Install

The plugin ships through three channels, in increasing order of convenience:

| Channel | How a user installs it | What it needs | Available now |
| --- | --- | --- | --- |
| **Manual** | Download the zip and unpack it into the vault | One zip | ✅ Ready |
| **GitHub Release + BRAT** | Install BRAT, paste the repository URL | A public repository + a release | ✅ Ready (release `0.1.8`) |
| **Official community directory** | Search "SyncMedic" in the directory and hit install | A public repository + an approved listing | ✅ Live (<https://community.obsidian.md/plugins/syncmedic>) |

### Channel 1: manual install

Download `syncmedic-0.1.8.zip` and unpack it into your vault:

```
<your vault>/.obsidian/plugins/syncmedic/
├── manifest.json
├── main.js
└── styles.css
```

Then: Settings → Community plugins → turn off restricted mode → reload →
enable **SyncMedic**.

> `data.json` is the plugin's own settings file; you do not have to create it.

### Channel 2: GitHub Release + BRAT

1. The author publishes a GitHub release whose assets include `main.js`,
   `manifest.json` and `styles.css`
2. The user installs **BRAT** from the official directory
3. In BRAT: `Plugins: Add a beta plugin for testing`, then paste the
   repository URL

> **BRAT installs the release assets, not the branch or the source tree.** A
> repository without a usable release cannot be installed by BRAT, so the
> three files have to be attached to the release.

The upside: no review to wait for, and every change reaches the beta users
immediately.

### Channel 3: official community directory

Users search for the plugin in the directory, install it with one click and get
automatic updates. The cost is the review.

Publishing steps:

1. The source lives in a **public** GitHub repository with `manifest.json`,
   `README.md` and `LICENSE` in the root ✓
2. A release exists whose **tag equals the manifest version**, with
   `main.js` / `manifest.json` / `styles.css` attached ✓
3. Log in to <https://community.obsidian.md> with your directory account and
   connect your GitHub account
4. Claim the repository → **Plugins → New plugin** → fill in the repository
   URL, the owner and the screenshot paths → agree to the developer policies →
   submit
5. The directory scans the release automatically (it rebuilds your source and
   checks the release `main.js` byte-for-byte)

> ⚠️ It is **not** a pull request against `obsidianmd/obsidian-releases` — that
> channel is closed for pull requests. The entry point is
> **community.obsidian.md**.

The full step-by-step manual is in [`RELEASE.md`](./RELEASE.md), and every
field of the submission form is pre-filled in [`SUBMIT.md`](./SUBMIT.md).

Common rejection reasons are listed in the [official plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines). This plugin has been checked against them: no global `app`, no debug logging, no lookbehind in any regex (safe on old iOS), no `innerHTML`, commands use `callback`, resources are released with the plugin, **files inside the vault go through the Vault API and only the configuration folder uses the Adapter API** (the configuration folder is not part of the vault index, so the Vault API cannot see it), and the configuration folder is read from `vault.configDir` instead of being hard-coded.

---

### Build it yourself

```bash
npm install
npm run build
```

### Releasing this plugin

The full manual is in [`RELEASE.md`](./RELEASE.md). The shortest path:

```bash
python scripts/release.py configure --github your-github-username  # set the author info
python scripts/release.py check --tag 0.1.8                        # pre-release checks
python scripts/release.py package                                  # build dist/
python scripts/release.py entry --repo your-username/obsidian-syncmedic  # the listing line
```

Once the `0.1.8` tag is pushed, GitHub Actions runs the tests, builds and
publishes the release by itself.

---

## Development

```bash
npm install

npm test          # 88 unit tests (Node's built-in test runner, no extra dependencies)
npm run typecheck # tsc --noEmit
npm run build     # bundles main.js
node scripts/verify.ts   # end-to-end run against the real samples in samples/
npm run check:fingerprints  # checks that every fingerprint still exists upstream
```

The fingerprint check is worth knowing about: every rule matches text that
Remotely Save or LiveSync prints, and when an upstream project rewrites a
message the rule silently stops matching. `src/rule-anchors.ts` pins each
fingerprint to the upstream file or issue it came from, and a scheduled
workflow fails and opens an issue when one of them is gone. See
[`docs/fingerprint-drift.md`](./docs/fingerprint-drift.md).

Node 22.18 or newer is required, because the test runner strips the
TypeScript types.

### Code structure

```
src/
├── redact.ts    Redaction: 14 kinds of secrets and personal data, idempotent, no collateral damage
├── rules.ts     The 22 failure signatures + fix steps + issue links
├── logs.ts      Runtime discovery of the log sources (cross-platform, via vault.adapter)
├── report.ts    Markdown / JSON / one-line summary rendering
├── pipeline.ts  Collect -> redact -> match -> report
├── settings.ts  Settings and normalisation
├── obsidian-adapter.ts  Vault API / Adapter API split
├── ui.ts        Report dialog / paste dialog / settings panel
└── main.ts      Plugin entry point: commands, ribbon icon, settings tab
```

`redact.ts` / `rules.ts` / `logs.ts` / `report.ts` / `pipeline.ts` /
`settings.ts` **do not depend on Obsidian** and are all unit tested. `ui.ts` /
`main.ts` / `obsidian-adapter.ts` only do the binding.

### A few hard rules of the design

1. **Log paths are never hard-coded.** Upstream moves its files around, so the
   collector discovers the sources at runtime and claims them by file name
   patterns.
2. **Rules only look for evidence, they never guess.** Every signature comes
   from source code or from a real error message.
3. **Redaction has to be exact, and must not destroy the structure.** The rules
   match on the structure around an error, so a secret replaced by
   `[REDACTED:xxx]` still lets the rule match.
4. **The report is safe to publish.** That is the whole point: it is meant to
   be pasted into an issue.

---

## What is not built yet

Stating it is more useful than overselling:

- **No hosted fix, no hosted relay** (the paid tier). Today this is local
  diagnosis only.
- **No login, no subscription, no payment.** A paid tier has to charge on the
  server side (client-side checks can be patched), so that is a design
  decision, not an oversight.
- **The rules are static.** There is no scraper that turns new issues into new
  rules yet.
- **Only those two plugins are supported.** Other sync plugins (GitSync and
  friends) are out of scope.
- **The official directory listing has no screenshots yet.** The plugin is live at
  <https://community.obsidian.md/plugins/syncmedic> and installs with one click;
  the listing page still needs real screenshots, which have to be taken inside
  Obsidian.

---

## Where the data comes from

Not one rule in this plugin was made up. The sources:

- Upstream issues: the issue trackers of Remotely Save and Self-hosted
  LiveSync, fetched on 2026-11-24
- Upstream source code: `remotely-save`'s `src/baseTypes.ts` (the
  `_debug_remotely_save/` and `log_hist_exported_on_` prefixes),
  `src/debugMode.ts`, `src/fsWebdav.ts`, `src/fsDropbox.ts`;
  `obsidian-livesync`'s `src/runCommand.ts` (the "database is not unlocked"
  message), `src/modules/features/ModuleLog.ts`,
  `src/serviceFeatures/conflictResolution/*`,
  `src/features/LocalDatabaseMainte/CmdLocalDatabaseMainte.ts`
- The Logstravaganza usage comes from the Remotely Save documentation at
  `docs/how_to_debug/use_logstravaganza.md`
- The LiveSync log file name (`livesync_log_` prefix, vault root) comes from
  that plugin's own e2e test at
  `test/e2e-obsidian/scripts/dialog-mounts.ts`

---

## License

MIT
