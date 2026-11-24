#!/usr/bin/env python3
"""Add one plugin entry to obsidian-releases' community-plugins.json.

The file is a 3.2 MB JSON array with one object per entry, so it cannot be
edited through GitHub's web editor. Two strategies are tried:

  1. round-trip: parse the file, append the entry, re-serialise with
     indent=2. This is only used when re-serialising WITHOUT the new entry
     reproduces the original file byte for byte, so the diff stays minimal.
  2. surgical: insert the new object as text just before the closing "]",
     matching the indentation of the neighbouring entries.

Usage:
    python scripts/add_plugin_entry.py <path-to-community-plugins.json> <entry.json>
"""
import json
import sys


def roundtrip_is_stable(path: str) -> bool:
    with open(path, encoding="utf-8") as fh:
        original = fh.read()
    try:
        data = json.loads(original)
    except json.JSONDecodeError:
        return False
    rendered = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    return rendered == original


def insert_surgically(path: str, entry: dict) -> None:
    with open(path, encoding="utf-8") as fh:
        text = fh.read()

    closing = text.rstrip().rfind("]")
    if closing < 0:
        raise SystemExit("no closing bracket found")

    head = text[:closing].rstrip()
    tail = text[closing:]

    # Match the indentation of the last entry in the array.
    last_entry_start = head.rfind("\n  {")
    if last_entry_start < 0:
        raise SystemExit("could not locate the last array entry")
    sample = head[last_entry_start + 1 :]
    indent = " " * (len(sample) - len(sample.lstrip(" ")))

    block = json.dumps(entry, ensure_ascii=False, indent=2)
    block = "\n".join(indent + line if line else line for line in block.splitlines())

    # The previous entry needs a trailing comma now.
    if not head.endswith("}"):
        raise SystemExit("unexpected file shape")
    head = head + ","

    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(head + "\n" + block + "\n" + tail.lstrip() + "\n")


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    path, entry_path = sys.argv[1], sys.argv[2]

    with open(entry_path, encoding="utf-8") as fh:
        entry = json.load(fh)

    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)

    if any(item.get("id") == entry["id"] for item in data):
        print(f"'{entry['id']}' is already listed - nothing to do")
        return 0

    if roundtrip_is_stable(path):
        data.append(entry)
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        print(f"added '{entry['id']}' via a clean json round-trip")
    else:
        insert_surgically(path, entry)
        print(f"added '{entry['id']}' with a surgical text insert")

    # Validate the result.
    with open(path, encoding="utf-8") as fh:
        check = json.load(fh)
    assert any(item.get("id") == entry["id"] for item in check), "entry missing"
    print(f"total entries now: {len(check)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
