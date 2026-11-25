# Screenshots

The Obsidian Community directory asks for screenshot paths that are relative
to the repository root, for example `screenshots/report.png`.

Specifications (from the official docs):

- up to 5 desktop images at **1200 x 800**
- up to 5 mobile images at **900 x 1600**
- JPEG, PNG or WebP, **max 5 MB** each

## These are real screenshots

Every image in this folder was captured inside Obsidian 1.15.1 with SyncMedic
0.1.3 installed through BRAT, running against the log samples that live in
`samples/`. The directory scans the source code and the release assets, so a
mock-up that does not match what the plugin actually renders comes back as an
`error`.

| File | Content |
| --- | --- |
| `screenshots/01-report-overview.png` | The report modal: the summary line, the three actions, how many files were scanned, and the first matched rule with its severity, the exact log lines that matched, and the upstream issue link. |
| `screenshots/02-report-fixes.png` | The same report scrolled down: the numbered fix steps for the first finding and the start of the second one. |
| `screenshots/03-vault.png` | The vault with `livesync_log_2026-11-24.md` open, which is the log the report above was built from. |
| `screenshots/04-community-plugins.png` | Obsidian's community plugin list with BRAT and SyncMedic both installed and enabled. |
| `screenshots/05-paste-console.png` | The paste-console dialog, with real Obsidian developer console output pasted in. Content is parsed and redacted locally. |

## How they were made

1. Install Obsidian and create a vault.
2. Install BRAT, then add `meghan008288/obsidian-syncmedic` through
   `BRAT: Plugins: Add a beta plugin for testing`.
3. Copy the files from `samples/` into the vault so the scan has something
   real to read.
4. Run `SyncMedic: 运行同步体检`.
5. `Ctrl+Shift+I` opens the Obsidian developer console; switch it out of the
   way before capturing.
