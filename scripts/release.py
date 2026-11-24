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
            problems.append(f"manifest.json 缺少字段 {field}")

    version = str(manifest.get("version", ""))
    if not SEMVER.match(version):
        problems.append(f"version '{version}' 不是合法 semver")

    min_version = str(manifest.get("minAppVersion", ""))
    if not SEMVER.match(min_version):
        problems.append(f"minAppVersion '{min_version}' 不是合法 semver")

    plugin_id = str(manifest.get("id", ""))
    if not re.match(r"^[A-Za-z0-9._-]+$", plugin_id):
        problems.append(f"id '{plugin_id}' 含 Obsidian 不接受的字符")
    folder = os.path.basename(ROOT)
    if plugin_id != folder:
        problems.append(
            f"id '{plugin_id}' 与插件文件夹名 '{folder}' 不一致 —— Obsidian 靠这个对应"
        )

    author_url = str(manifest.get("authorUrl", ""))
    if not author_url.startswith("https://"):
        problems.append("authorUrl 必须是 https 链接")

    funding = manifest.get("fundingUrl")
    if funding is not None:
        urls = [funding] if isinstance(funding, str) else list(funding.values())
        for url in urls:
            if not str(url).startswith("https://"):
                problems.append(f"fundingUrl '{url}' 必须是 https 链接")

    # The code keeps its own copy of the version; they must not drift.
    settings_path = os.path.join(ROOT, "src", "settings.ts")
    with open(settings_path, encoding="utf-8") as fh:
        settings = fh.read()
    m = re.search(r'PLUGIN_VERSION\s*=\s*"([^"]+)"', settings)
    if not m:
        problems.append("src/settings.ts 里找不到 PLUGIN_VERSION")
    elif m.group(1) != version:
        problems.append(
            f"版本不一致：manifest.json 是 {version}，src/settings.ts 是 {m.group(1)}"
        )

    if args.tag:
        if args.tag != version:
            problems.append(
                f"tag '{args.tag}' 与 manifest 版本 '{version}' 不一致 —— "
                "Obsidian 要求 release tag、release 名称、manifest 版本三者完全相同"
            )

    for asset in ASSET_NAMES:
        if asset == "styles.css" and not os.path.exists(os.path.join(ROOT, asset)):
            continue
        if not os.path.exists(os.path.join(ROOT, asset)):
            problems.append(f"缺少构建产物 {asset}")

    if problems:
        print("✗ 有问题，先修掉再发版：\n")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("✓ 检查通过")
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
    print("✓ manifest.json 已更新")
    print(f"  author    {manifest['author']}")
    print(f"  authorUrl {manifest['authorUrl']}")
    print(f"  仓库      {owner}/{repo}   ← 提审时要填进 community-plugins.json")
    print()
    print("接下来：")
    print(f"  1. 在 GitHub 建公开仓库 {owner}/{repo}")
    print("  2. 把本目录内容推上去（仓库根目录要有 manifest.json）")
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
        print(f"✗ 缺少构建产物：{', '.join(missing)}；先跑 npm run build")
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

    print("✓ 发布物料已生成")
    print(f"  {DIST}")
    for asset in ASSET_NAMES:
        print(f"    {asset}")
    print(f"    syncmedic-{version}.zip   （手动安装用）")
    print()
    print("上传到 GitHub Release 时，附件名必须就是上面这几个字。")
    print(f"  tag / release 名称 / manifest 版本，三者都必须写成 {version}")
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
        print(f"✗ 提审条目缺字段：{', '.join(missing)}")
        return 1
    if len(entry["name"]) > 56:
        print("✗ name 超过注册表里最长的名字（56 字符）")
        return 1

    print("把下面这行加到 community-plugins.json 数组里，然后提 PR：")
    print(f"https://github.com/obsidianmd/obsidian-releases")
    print()
    print(json.dumps(entry, ensure_ascii=False))
    print()
    print("格式核对：官方 10844 条记录用的字段就是 id / name / author / description / repo。")
    return 0


def cmd_release(args):
    manifest = load_manifest()
    version = str(manifest["version"])
    tag = args.tag or version
    if tag != version:
        print(f"✗ tag '{tag}' 与 manifest 版本 '{version}' 必须完全相同")
        return 1

    if shutil.which("gh") is None:
        print("✗ 没找到 gh 命令行工具。手动发版步骤：")
        print()
        print("  1. 在 GitHub 上新建 Release")
        print(f"  2. tag 填 {tag}（不要加 v 前缀）")
        print(f"  3. Release 名称填 {tag}")
        print("  4. 上传 dist/ 里的 main.js / manifest.json / styles.css")
        print("     附件名必须完全一致，BRAT 按名字精确查找")
        print(f"  5. 描述可以填 CHANGELOG.md 的内容")
        print()
        print("  或者先装 gh：winget install GitHub.cli")
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
    parser = argparse.ArgumentParser(description="SyncMedic 发布工具")
    sub = parser.add_subparsers(dest="command", required=True)

    p_check = sub.add_parser("check", help="校验 manifest 与版本一致性")
    p_check.add_argument("--tag", help="要发布的 tag，用来核对三者是否一致")
    p_check.set_defaults(func=cmd_check)

    p_conf = sub.add_parser("configure", help="把 author / authorUrl 改成你的 GitHub")
    p_conf.add_argument("--github", required=True, help="GitHub 用户名或 owner/repo")
    p_conf.add_argument("--author", help="插件作者显示名")
    p_conf.add_argument("--repo-name", default="obsidian-syncmedic", help="仓库名")
    p_conf.add_argument("--funding", help="赞助链接（完整 https URL）")
    p_conf.add_argument("--remove-funding", action="store_true", help="删掉 fundingUrl")
    p_conf.set_defaults(func=cmd_configure)

    p_pkg = sub.add_parser("package", help="生成 dist/ 发布物料")
    p_pkg.set_defaults(func=cmd_package)

    p_entry = sub.add_parser("entry", help="生成提审用的 JSON 行")
    p_entry.add_argument("--repo", required=True, help="owner/repo")
    p_entry.set_defaults(func=cmd_entry)

    p_rel = sub.add_parser("release", help="创建 GitHub Release")
    p_rel.add_argument("--repo", required=True, help="owner/repo")
    p_rel.add_argument("--tag", help="tag，默认取 manifest 版本")
    p_rel.set_defaults(func=cmd_release)

    args = parser.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
