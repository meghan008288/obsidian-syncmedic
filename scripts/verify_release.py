#!/usr/bin/env python3
"""Verify that the published release matches the repository HEAD.

The Obsidian Community directory rebuilds the plugin from the source at HEAD
and compares it with the release assets. This script does the same check
locally, so problems show up before the review does.
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import urllib.request

REPO = "meghan008288/obsidian-syncmedic"
TAG = "0.1.4"
GH = os.path.join(
    os.environ.get("LOCALAPPDATA", ""), "Programs", "GitHub CLI", "bin", "gh.exe"
)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def gh_json(args):
    proc = subprocess.run(
        [GH, *args], capture_output=True, text=True, encoding="utf-8"
    )
    if proc.returncode != 0:
        raise SystemExit(f"gh failed: {proc.stderr.strip()}")
    return json.loads(proc.stdout)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    release = gh_json(
        ["release", "view", TAG, "--repo", REPO, "--json", "tagName,name,url,assets,isDraft,isPrerelease"]
    )

    print(f"Release {release['tagName']}  ({release['url']})")
    print(f"  release name = {release['name']}")
    print(f"  draft={release['isDraft']}  prerelease={release['isPrerelease']}")
    print()

    assets = {a["name"]: a for a in release["assets"]}
    problems = []

    # 1. required asset names, exactly
    for required in ("main.js", "manifest.json", "styles.css"):
        if required not in assets:
            problems.append(f"missing release asset: {required}")
    for name in assets:
        if name not in ("main.js", "manifest.json", "styles.css", f"syncmedic-{TAG}.zip"):
            problems.append(f"unexpected release asset: {name}")

    # 2. tag == release name == manifest version
    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as fh:
        head_manifest = json.load(fh)
    version = head_manifest["version"]
    if release["tagName"] != version:
        problems.append(
            f"tag '{release['tagName']}' != manifest version '{version}'"
        )
    if release["name"] != version:
        problems.append(
            f"release name '{release['name']}' != manifest version '{version}'"
        )

    # 3. byte-for-byte comparison of every asset against HEAD
    with tempfile.TemporaryDirectory() as tmp:
        for name in ("main.js", "manifest.json", "styles.css"):
            if name not in assets:
                continue
            url = assets[name]["url"]
            req = urllib.request.Request(url, headers={"User-Agent": "syncmedic-verify"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                remote = resp.read()
            local_path = os.path.join(ROOT, name)
            if not os.path.exists(local_path):
                problems.append(f"{name} is not present in the working tree")
                continue
            with open(local_path, "rb") as fh:
                local = fh.read()
            same = sha256(remote) == sha256(local)
            print(f"  {name:<15} {len(remote):>8} bytes  identical={same}")
            if not same:
                problems.append(f"{name} differs from the repository copy")

    print()
    if problems:
        print("PROBLEMS:")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("all release assets match the repository HEAD")
    return 0


if __name__ == "__main__":
    sys.exit(main())
