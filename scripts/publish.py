#!/usr/bin/env python3
"""Publish SyncMedic to GitHub.

Requires an authenticated `gh` CLI. Run `gh auth login` first.

Flow
----
1. read the authenticated user from the GitHub API
2. rewrite manifest.json with that user's name and profile URL
3. commit everything (identity = GitHub noreply address, so commits are
   attributed correctly without asking for a real email)
4. create the public repository and push
5. push the version tag, let the release workflow build the GitHub release,
   and fall back to creating it locally if the workflow does not fire
6. print the line to add to obsidianmd/obsidian-releases

Usage
-----
    python scripts/publish.py [--repo-name obsidian-syncmedic] [--yes]
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RELEASE_SCRIPT = os.path.join(ROOT, "scripts", "release.py")

DESCRIPTION = (
    "本地诊断 Obsidian 同步故障（Remotely Save / Self-hosted LiveSync），"
    "给出证据、原因和修复步骤。日志只在本机解析，不上传。"
)
TOPICS = [
    "obsidian",
    "obsidian-plugin",
    "sync",
    "remotely-save",
    "livesync",
    "diagnostics",
    "troubleshooting",
]


def resolve_gh():
    """Find the gh executable, even when the current shell's PATH is stale.

    Installing gh updates the *user* PATH, but a shell that was already open
    keeps the old value, so subprocess calls would fail with FileNotFoundError.
    """
    found = shutil.which("gh")
    if found:
        return found

    candidates = [
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "GitHub CLI", "bin", "gh.exe"),
        os.path.join(os.environ.get("ProgramFiles", ""), "GitHub CLI", "gh.exe"),
    ]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return candidate

    # Last resort: read the persisted user PATH and look inside it.
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, r"Environment"
        ) as key:
            user_path = winreg.QueryValueEx(key, "Path")[0]
        for directory in user_path.split(os.pathsep):
            candidate = os.path.join(directory.strip('"'), "gh.exe")
            if os.path.exists(candidate):
                return candidate
    except Exception:  # noqa: BLE001
        pass

    return None


GH = resolve_gh()


def run(cmd, cwd=ROOT, check=True, capture=True):
    print("→", " ".join(cmd))
    result = subprocess.run(
        cmd,
        cwd=cwd,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
    )
    if capture and result.stdout:
        for line in result.stdout.rstrip().splitlines():
            print("   ", line)
    if check and result.returncode != 0:
        print(f"✗ 命令失败（exit {result.returncode}）")
        sys.exit(result.returncode)
    return result


def gh(*args, **kwargs):
    if GH is None:
        print("✗ 找不到 gh 命令行工具。")
        print("  请安装 GitHub CLI 后重试：")
        print("    https://cli.github.com/")
        sys.exit(1)
    return run([GH, *args], **kwargs)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-name", default="obsidian-syncmedic")
    parser.add_argument("--yes", action="store_true", help="跳过确认")
    args = parser.parse_args()

    print("=" * 70)
    print("SyncMedic 发布")
    print("=" * 70)

    # 1. who am I
    status = gh("auth", "status", check=False)
    if status.returncode != 0:
        print("\n✗ gh 还没登录。请先在终端执行：\n")
        print("    gh auth login --web --git-protocol https\n")
        print("  它会给一个一次性验证码，在浏览器里确认后回到终端粘贴即可。")
        return 1

    login = gh("api", "user", "--jq", ".login", check=True).stdout.strip().splitlines()[-1]
    user_id = gh("api", "user", "--jq", ".id", check=True).stdout.strip().splitlines()[-1]
    repo_slug = f"{login}/{args.repo_name}"
    print(f"\n登录账号: {login} (id {user_id})")
    print(f"目标仓库: https://github.com/{repo_slug}\n")

    if not args.yes:
        answer = input(f"确认创建公开仓库 {repo_slug} 并发布 v0.1.0？[y/N] ").strip().lower()
        if answer not in ("y", "yes"):
            print("已取消")
            return 1

    # 2. manifest
    run([sys.executable, RELEASE_SCRIPT, "configure", "--github", login, "--author", login])

    # 3. git identity + commit
    email = f"{user_id}+{login}@users.noreply.github.com"
    run(["git", "config", "user.name", login])
    run(["git", "config", "user.email", email])
    run(["git", "add", "-A"])
    has_commit = run(
        ["git", "rev-parse", "--verify", "HEAD"], check=False, capture=True
    ).returncode == 0
    if has_commit:
        dirty = run(["git", "status", "--porcelain"], check=False, capture=True).stdout.strip()
        if dirty:
            run(["git", "commit", "-m", "Release 0.1.0"])
        else:
            print("工作区干净，无需新提交")
    else:
        run(["git", "commit", "-m", "SyncMedic 0.1.0"])

    # 4. repository
    existing = gh("repo", "view", repo_slug, "--json", "name", check=False)
    if existing.returncode != 0:
        created = gh(
            "repo", "create", repo_slug,
            "--public",
            "--source=.",
            "--remote=origin",
            "--push",
            "--description", DESCRIPTION,
            check=False,
        )
        if created.returncode != 0:
            print()
            print("✗ 建不了仓库。")
            print("  当前 token 是 GitHub App 签发的（ghu_ 前缀），")
            print("  GitHub App 原理上拿不到『建仓库』这种账号级权限。")
            print()
            print("  两个解决办法，任选其一：")
            print()
            print("  A. 在浏览器里手动建一个空仓库（10 秒）")
            print(f"     https://github.com/new?name={args.repo_name}&visibility=public")
            print(f"     仓库名填 {args.repo_name}，可见性 Public，")
            print("     下面四个勾全部取消（尤其不要勾 README），点 Create repository。")
            print("     建完告诉我，我这边自动接着推代码、发 Release。")
            print()
            print("  B. 换一个有建仓权限的 token（OAuth App 的 gho_ token）")
            print("     python scripts/gh_device_login.py request   # 拿设备码")
            print("     在 https://github.com/login/device 输入码并 Authorize")
            print("     python scripts/gh_device_login.py poll      # 接住 token")
            print()
            print("  查这个 token 到底能干什么：")
            print("     gh api /repos/meghan008288/meghan --jq .permissions")
            return 1
    else:
        print(f"仓库已存在，跳过创建: {repo_slug}")
        run(["git", "remote", "remove", "origin"], check=False)
        run(["git", "remote", "add", "origin", f"https://github.com/{repo_slug}.git"])
        run(["git", "push", "-u", "origin", "main"])

    gh("repo", "edit", repo_slug, "--description", DESCRIPTION, check=False)
    for topic in TOPICS:
        gh("repo", "edit", repo_slug, "--add-topic", topic, check=False)

    # 5. tag + release
    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as fh:
        version = json.load(fh)["version"]

    run(["git", "tag", "-f", version], check=False)
    run(["git", "push", "origin", version])

    print(f"\n等待 release workflow（tag {version}）…")
    released = False
    for attempt in range(30):
        time.sleep(10)
        view = gh("release", "view", version, "--repo", repo_slug, "--json", "tagName",
                  check=False)
        if view.returncode == 0:
            released = True
            print(f"✓ Release 已由 workflow 创建（等待 {(attempt + 1) * 10}s）")
            break
        print(f"   等待中… {(attempt + 1) * 10}s")

    if not released:
        print("\nworkflow 没产出 Release，本地兜底创建。")
        run([sys.executable, RELEASE_SCRIPT, "package"])
        dist = os.path.join(ROOT, "dist")
        gh(
            "release", "create", version,
            os.path.join(dist, "main.js"),
            os.path.join(dist, "manifest.json"),
            os.path.join(dist, "styles.css"),
            "--repo", repo_slug,
            "--title", version,
            "--notes-file", os.path.join(ROOT, "CHANGELOG.md"),
        )

    # verify the assets are named exactly the way BRAT expects
    print("\n=== 校验 Release 资产名 ===")
    assets = gh("release", "view", version, "--repo", repo_slug, "--json",
                "assets", "--jq", ".assets[].name").stdout
    names = [n.strip() for n in assets.splitlines() if n.strip()]
    for required in ("main.js", "manifest.json", "styles.css"):
        status = "OK  " if required in names else "MISS"
        print(f"  {status} {required}")
    print(f"  实际资产: {', '.join(names)}")

    # 6. the community registry entry
    print("\n=== 提交官方社区插件市场用的一行 ===")
    run([sys.executable, RELEASE_SCRIPT, "entry", "--repo", repo_slug])

    print("\n" + "=" * 70)
    print("完成。")
    print(f"仓库    : https://github.com/{repo_slug}")
    print(f"Release : https://github.com/{repo_slug}/releases/tag/{version}")
    print("")
    print("BRAT 用户安装：装 BRAT 后执行命令")
    print("  Plugins: Add a beta plugin for testing")
    print(f"  填入: {repo_slug}")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
