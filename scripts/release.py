#!/usr/bin/env python3
"""Release tooling for SyncMedic.

Sub-commands
------------
check      validate manifest.json and the version consistency rules
configure  rewrite the author / authorUrl / fundingUrl in manifest.json
package    build dist/ with the three release assets, named exactly the way
           BRAT and the Obsidian registry expect them
entry      print the line to add to obsidianmd/obsidian-releases
           community-plugins.json
release    create the GitHub release (needs the `gh` CLI)

The hard rules encoded here come from reading the upstream tooling:

* BRAT fetches the release assets by exact file name
  (src/features/BetaPlugins.ts: `grabReleaseFileFromRepository(release,
  "main.js" / "manifest.json" / "styles.css")`), so the asset names are not
  negotiable.
* Obsidian requires the release tag, the release name and the version inside
  the released manifest.json to be identical. BRAT itself only warns and
  overrides, but the official updater does not.
* The repository has to be public, and its default branch needs a
  manifest.json in the root so Obsidian recognises it as a plugin repo.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST_PATH = os.path.join(ROOT, "manifest.json")
DIST = os.path.join(ROOT, "dist")

# BRAT looks these up by exact name.
ASSET_NAMES = ("main.js", "manifest.json", "styles.css")

SEMVER = re.compile(r"^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$")
REGISTRY_ENTRY_FIELDS = ("id", "name", "author", "description", "repo")


def load_manifest():
    with open(MANIFEST_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def save_manifest(data):
    # Obsidian's own plugins use tab indentation; keep the file consistent.
    with open(MANIFEST_PATH, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, ensure_ascii=False, indent="\t")
        fh.write("\n")


def cmd_check(args):
    manifest = load_manifest()
    problems = []

    for field in ("id", "name", "version", "minAppVersion", "description",
                  "author", "authorUrl", "isDesktopOnly"):
        if field not in manifest:
            problems.append(f"manifest.json is missing the field {field}")

    version = str(manifest.get("version", ""))
    if not SEMVER.match(version):
        problems.append(f"version '{version}' is not a valid semver")

    min_version = str(manifest.get("minAppVersion", ""))
    if not SEMVER.match(min_version):
        problems.append(f"minAppVersion '{min_version}' is not a valid semver")

    plugin_id = str(manifest.get("id", ""))
    if not re.match(r"^[A-Za-z0-9._-]+$", plugin_id):
        problems.append(f"id '{plugin_id}' contains characters Obsidian does not accept")
    folder = os.path.basename(ROOT)
    if plugin_id != folder:
        problems.append(
            f"id '{plugin_id}' does not match the plugin folder name '{folder}' - Obsidian maps them by that"
        )

    author_url = str(manifest.get("authorUrl", ""))
    if not author_url.startswith("https://"):
        problems.append("authorUrl must be an https URL")

    funding = manifest.get("fundingUrl")
    if funding is not None:
        urls = [funding] if isinstance(funding, str) else list(funding.values())
        for url in urls:
            if not str(url).startswith("https://"):
                problems.append(f"fundingUrl '{url}' must be an https URL")

    # The code keeps its own copy of the version; they must not drift.
    settings_path = os.path.join(ROOT, "src", "settings.ts")
    with open(settings_path, encoding="utf-8") as fh:
        settings = fh.read()
    m = re.search(r'PLUGIN_VERSION\s*=\s*"([^"]+)"', settings)
    if not m:
        problems.append("PLUGIN_VERSION was not found in src/settings.ts")
    elif m.group(1) != version:
        problems.append(
            f"version mismatch: manifest.json says {version}, src/settings.ts says {m.group(1)}"
        )

    if args.tag:
        if args.tag != version:
            problems.append(
                f"tag '{args.tag}' does not match the manifest version '{version}' - "
                "Obsidian requires the release tag, the release name and the manifest version to be identical"
            )

    for asset in ASSET_NAMES:
        if asset == "styles.css" and not os.path.exists(os.path.join(ROOT, asset)):
            continue
        if not os.path.exists(os.path.join(ROOT, asset)):
            problems.append(f"missing build artifact {asset}")

    if problems:
        print("✗ there are problems, fix them before releasing:\n")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("✓ checks passed")
    print(f"  id            {manifest['id']}")
    print(f"  name          {manifest['name']}")
    print(f"  version       {manifest['version']}")
    print(f"  minAppVersion {manifest['minAppVersion']}")
    print(f"  author        {manifest['author']}")
    print(f"  authorUrl     {manifest['authorUrl']}")
    return 0


def cmd_configure(args):
    manifest = load_manifest()
    github = args.github.strip().strip("/")
    if github.startswith("http"):
        github = github.rstrip("/").split("/")[-1]
    if "/" in github:
        owner, repo = github.split("/", 1)
    else:
        owner, repo = github, args.repo_name

    manifest["author"] = args.author or manifest.get("author") or owner
    manifest["authorUrl"] = f"https://github.com/{owner}"
    if args.funding:
        manifest["fundingUrl"] = {"Buy Me a Coffee": args.funding}
    elif args.remove_funding:
        manifest.pop("fundingUrl", None)

    save_manifest(manifest)
    print("✓ manifest.json updated")
    print(f"  author    {manifest['author']}")
    print(f"  authorUrl {manifest['authorUrl']}")
    print(f"  repository  {owner}/{repo}   <- this is what goes into community-plugins.json")
    print()
    print("Next:")
    print(f"  1. Create the public repository {owner}/{repo} on GitHub")
    print("  2. Push this directory to it (the repository root needs a manifest.json)")
    print(f"  3. python scripts/release.py check --repo {owner}/{repo}")
    print(f"  4. python scripts/release.py entry --repo {owner}/{repo}")
    return 0


def cmd_package(args):
    manifest = load_manifest()
    version = str(manifest["version"])

    missing = [
        asset
        for asset in ASSET_NAMES
        if not os.path.exists(os.path.join(ROOT, asset))
    ]
    if missing:
        print(f"✗ missing build artifacts: {', '.join(missing)}; run npm run build first")
        return 1

    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)

    for asset in ASSET_NAMES:
        shutil.copy2(os.path.join(ROOT, asset), os.path.join(DIST, asset))

    zip_path = os.path.join(DIST, f"syncmedic-{version}.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for asset in ASSET_NAMES:
            zf.write(os.path.join(DIST, asset), asset)

    print("✓ release artifacts generated")
    print(f"  {DIST}")
    for asset in ASSET_NAMES:
        print(f"    {asset}")
    print(f"    syncmedic-{version}.zip   (for a manual install)")
    print()
    print("When uploading to the GitHub release the asset names have to be exactly the ones listed above.")
    print(f"  the tag, the release name and the manifest version all have to be {version}")
    return 0


def cmd_entry(args):
    manifest = load_manifest()
    entry = {
        "id": manifest["id"],
        "name": manifest["name"],
        "author": manifest["author"],
        "description": manifest["description"],
        "repo": args.repo,
    }
    missing = [f for f in REGISTRY_ENTRY_FIELDS if not entry.get(f)]
    if missing:
        print(f"✗ the directory entry is missing fields: {', '.join(missing)}")
        return 1
    if len(entry["name"]) > 56:
        print("✗ the name is longer than the longest name in the registry (56 characters)")
        return 1

    print("Add the line below to the community-plugins.json array, then open a PR:")
    print(f"https://github.com/obsidianmd/obsidian-releases")
    print()
    print(json.dumps(entry, ensure_ascii=False))
    print()
    print("Format check: the official 10844 records use exactly the fields id / name / author / description / repo.")
    return 0


def cmd_release(args):
    manifest = load_manifest()
    version = str(manifest["version"])
    tag = args.tag or version
    if tag != version:
        print(f"✗ the tag '{tag}' and the manifest version '{version}' must be identical")
        return 1

    if shutil.which("gh") is None:
        print("✗ the gh command line tool was not found. Manual release steps:")
        print()
        print("  1. Create a new release on GitHub")
        print(f"  2. Use {tag} as the tag (no v prefix)")
        print(f"  3. Use {tag} as the release name")
        print("  4. Upload main.js / manifest.json / styles.css from dist/")
        print("     The asset names have to match exactly, BRAT looks them up by name")
        print(f"  5. The release body can be the content of CHANGELOG.md")
        print()
        print("  Or install gh first: winget install GitHub.cli")
        return 1

    cmd = [
        "gh", "release", "create", tag,
        os.path.join(DIST, "main.js"),
        os.path.join(DIST, "manifest.json"),
        os.path.join(DIST, "styles.css"),
        "--repo", args.repo,
        "--title", tag,
        "--notes-file", os.path.join(ROOT, "CHANGELOG.md"),
    ]
    print("→", " ".join(cmd))
    result = subprocess.run(cmd, cwd=ROOT)
    return result.returncode


def main():
    parser = argparse.ArgumentParser(description="SyncMedic release tool")
    sub = parser.add_subparsers(dest="command", required=True)

    p_check = sub.add_parser("check", help="check the manifest and version consistency")
    p_check.add_argument("--tag", help="the tag to release, used to check that all three match")
    p_check.set_defaults(func=cmd_check)

    p_conf = sub.add_parser("configure", help="rewrite author / authorUrl to your GitHub")
    p_conf.add_argument("--github", required=True, help="GitHub user name or owner/repo")
    p_conf.add_argument("--author", help="the author name shown to users")
    p_conf.add_argument("--repo-name", default="obsidian-syncmedic", help="repository name")
    p_conf.add_argument("--funding", help="sponsoring link (the full https URL)")
    p_conf.add_argument("--remove-funding", action="store_true", help="remove fundingUrl")
    p_conf.set_defaults(func=cmd_configure)

    p_pkg = sub.add_parser("package", help="generate the release artifacts in dist/")
    p_pkg.set_defaults(func=cmd_package)

    p_entry = sub.add_parser("entry", help="generate the JSON line for the submission")
    p_entry.add_argument("--repo", required=True, help="owner/repo")
    p_entry.set_defaults(func=cmd_entry)

    p_rel = sub.add_parser("release", help="create the GitHub release")
    p_rel.add_argument("--repo", required=True, help="owner/repo")
    p_rel.add_argument("--tag", help="tag, defaults to the manifest version")
    p_rel.set_defaults(func=cmd_release)

    args = parser.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
