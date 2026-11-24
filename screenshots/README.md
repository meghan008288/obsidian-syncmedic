# Screenshots

The Obsidian Community directory asks for a screenshot path that is relative to
the repository root, for example `screenshots/screenshot.png`.

Specifications (from the official docs):

- up to 5 desktop images at **1200 × 800**
- up to 5 mobile images at **900 × 1600**
- JPEG, PNG or WebP, **max 5 MB** each

## These must be real screenshots

The directory scans the source code and the release assets. A mock-up that
does not match what the plugin actually renders will come back as an `error`,
and you will have to publish a new version to clear it. Take the screenshots
from inside Obsidian after installing the plugin.

## What to capture

| File | Content |
| --- | --- |
| `screenshots/report.png` | The report modal, showing matched rules with their evidence lines and fix steps. Reproduce a failure first — see `samples/` for a log that triggers all 22 rules. |
| `screenshots/sources.png` | The lower half of the report: which log sources were scanned, which came up empty, and what to do about it. |
| `screenshots/settings.png` | The settings tab. |

## How to get a clean shot

1. Install the plugin and enable it.
2. Drop one of the files in `samples/` into a vault so the scan has something
   real to read.
3. Run `SyncMedic: 运行同步体检`.
4. `Ctrl+Shift+I` opens the Obsidian developer console; switch it out of the
   way before capturing.

If a rule fires more than you want in the shot, crop the image — but keep the
file name and path intact, because that is what you type into the submission
form.
