#!/usr/bin/env python3
"""GitHub device-code login, driven over curl.

Why curl and not urllib: on this machine the route to github.com is flaky and
Python's urllib wedges on POST (WinError 10060 / "Remote end closed
connection"), while curl.exe on the same host gets through. So the HTTP calls
go through curl.exe.

The `flow` sub-command issues the code and starts polling in the SAME process,
so the 15-minute device-code window is spent waiting for the human instead of
being eaten by our own retry logic.

Flow (https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/device-flow):
  1. POST /login/device/code                 -> device_code, user_code, interval
  2. the human visits /login/device, types user_code, authorizes
  3. POST /login/oauth/access_token          -> access_token

Usage:
    python scripts/gh_device_login.py flow     # issue code + poll in one go
    python scripts/gh_device_login.py request  # issue code only
    python scripts/gh_device_login.py poll     # poll an existing code
"""
import json
import os
import subprocess
import sys
import time

STATE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", ".gh-device-state.json"
)
API = "https://github.com"

# The GitHub CLI's OAuth app, taken from cli/cli internal/authflow/flow.go:
#
#   oauthClientID = "178c6fc778ccc68e1d6a"   // the "GitHub CLI" OAuth app
#
# It issues a `gho_` token with the `repo` scope, which is what a GitHub App
# token cannot do: an App token can only WRITE to repositories the app is
# installed on, so it cannot create a repository or push to a fresh one
# ("Resource not accessible by integration").
#
# Do NOT use an `Iv1.*` id here. The ones embedded in gh.exe belong to other
# apps: Iv1.b231c327f1eaa229 resolves to "Visual Studio Tunnel Service -
# Test" on github.com/login/oauth/authorize, and Iv1.e7b89e013f801f03
# redirects to global.rel.tunnels.api.visualstudio.com. Authorizing either
# one hands a third-party app access to the account instead of the CLI.
CANDIDATE_CLIENT_IDS = [
    "178c6fc778ccc68e1d6a",
]

GH_EXE = os.path.join(
    os.environ.get("LOCALAPPDATA", ""), "Programs", "GitHub CLI", "bin", "gh.exe"
)
SCOPE = "repo read:org gist workflow"


def curl_post(url, fields, attempts=8):
    """POST form fields with curl.exe, retrying on the flaky network."""
    args = ["curl.exe", "-s", "--max-time", "25", "-X", "POST", url,
            "-H", "Accept: application/json"]
    for key, value in fields.items():
        args += ["-d", f"{key}={value}"]
    last = ""
    for attempt in range(attempts):
        try:
            proc = subprocess.run(args, capture_output=True, text=True)
            out = (proc.stdout or "").strip()
            if out:
                try:
                    return json.loads(out)
                except json.JSONDecodeError:
                    last = out[:200]
            else:
                last = (proc.stderr or "").strip()[:200] or "empty response"
        except Exception as e:  # noqa: BLE001
            last = str(e)
        print(f"  retry {attempt + 1}/{attempts}: {last}", file=sys.stderr)
        time.sleep(3)
    raise SystemExit(f"request failed: {last}")


def request_code():
    for client_id in CANDIDATE_CLIENT_IDS:
        print(f"trying client_id={client_id} ...", file=sys.stderr)
        resp = curl_post(
            f"{API}/login/device/code",
            {"client_id": client_id, "scope": SCOPE},
        )
        if resp.get("device_code"):
            state = {
                "device_code": resp["device_code"],
                "user_code": resp["user_code"],
                "interval": resp.get("interval", 5),
                "expires_in": resp.get("expires_in", 900),
                "client_id": client_id,
            }
            with open(STATE, "w", encoding="utf-8") as fh:
                json.dump(state, fh)
            return state
        print(f"  rejected: {resp}", file=sys.stderr)
    raise SystemExit("every candidate client_id was rejected")


def poll(state):
    interval = max(int(state.get("interval", 5)), 5)
    deadline = time.time() + int(state.get("expires_in", 900))
    print("waiting for authorization ...", flush=True)
    while time.time() < deadline:
        resp = curl_post(
            f"{API}/login/oauth/access_token",
            {
                "client_id": state["client_id"],
                "device_code": state["device_code"],
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
        )
        if resp.get("access_token"):
            return resp["access_token"]
        error = resp.get("error", "")
        if error == "authorization_pending":
            time.sleep(interval)
            continue
        if error == "slow_down":
            interval += 5
            time.sleep(interval)
            continue
        if error == "expired_token":
            print("device code expired, request a new one", file=sys.stderr)
            return None
        print(f"GitHub returned an error: {resp}", file=sys.stderr)
        return None
    print("timed out", file=sys.stderr)
    return None


def install_token(token):
    print(f"got token ({token[:8]}...)", flush=True)
    proc = subprocess.run(
        [GH_EXE, "auth", "login", "--with-token"],
        input=token,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        print("gh auth login --with-token failed:", proc.stdout, proc.stderr)
        return False
    subprocess.run([GH_EXE, "auth", "setup-git"], capture_output=True, check=False)
    who = subprocess.run(
        [GH_EXE, "api", "user", "--jq", ".login"], capture_output=True, text=True
    )
    prefix = subprocess.run(
        [GH_EXE, "auth", "token"], capture_output=True, text=True
    ).stdout.strip()
    print(f"logged in as {who.stdout.strip()}  (token type {prefix[:4]})")
    return True


def cmd_flow():
    state = request_code()
    print("=" * 62, flush=True)
    print(f"  device code: {state['user_code']}", flush=True)
    print(f"  valid for  : {state['expires_in']} seconds", flush=True)
    print("=" * 62, flush=True)
    print(f"open {API}/login/device and enter the code, then Authorize.", flush=True)
    token = poll(state)
    if not token:
        return 1
    return 0 if install_token(token) else 1


def cmd_request():
    state = request_code()
    print("=" * 62)
    print(f"  device code: {state['user_code']}")
    print(f"  valid for  : {state['expires_in']} seconds")
    print("=" * 62)
    print(f"open {API}/login/device and enter the code, then Authorize.")
    return 0


def cmd_poll():
    if not os.path.exists(STATE):
        raise SystemExit("no device code state; run request first")
    with open(STATE, encoding="utf-8") as fh:
        state = json.load(fh)
    token = poll(state)
    if not token:
        return 1
    return 0 if install_token(token) else 1


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "flow"
    {"flow": cmd_flow, "request": cmd_request, "poll": cmd_poll}[command]()
