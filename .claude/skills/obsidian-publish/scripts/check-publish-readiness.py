#!/usr/bin/env python3
"""
check-publish-readiness.py
Run from a plugin's root directory:
  python3 <path-to-skill>/scripts/check-publish-readiness.py

Exits 0 if all MUST checks pass, 1 if any FAIL.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

cwd = Path.cwd()
results = []

# Early exit with helpful message if not in a plugin directory
if not (cwd / "manifest.json").exists():
    print(f"❌ No manifest.json found in: {cwd}")
    print("   Run this from a plugin's root directory, e.g.:")
    print("   cd obsidian-eagle-plugin && python3 .../check-publish-readiness.py")
    sys.exit(1)


def passed(group, label):
    results.append({"group": group, "label": label, "status": "PASS"})


def failed(group, label, hint):
    results.append({"group": group, "label": label, "status": "FAIL", "hint": hint})


def warned(group, label, hint):
    results.append({"group": group, "label": label, "status": "WARN", "hint": hint})


def read_json(filename):
    try:
        return json.loads((cwd / filename).read_text())
    except Exception:
        return None


def file_exists(filename):
    try:
        return (cwd / filename).stat().st_size > 0
    except Exception:
        return False


def grep_src(pattern, flags=0):
    """Walk src/ and return matching lines."""
    src_dir = cwd / "src"
    if not src_dir.exists():
        return ""
    regex = re.compile(pattern, flags)
    hits = []
    for path in src_dir.rglob("*"):
        if path.suffix not in (".ts", ".js"):
            continue
        for i, line in enumerate(path.read_text(errors="replace").splitlines(), 1):
            if regex.search(line):
                hits.append(f"{path.relative_to(cwd)}:{i}: {line.strip()}")
    return "\n".join(hits)


def has_emoji(text):
    return bool(re.search(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]", text))


def is_semver(v):
    return bool(re.match(r"^\d+\.\d+\.\d+$", str(v)))


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)


# ── Group 1: Required files ────────────────────────────────────────────────────

G_FILES = "Required Files"

if file_exists("README.md"):
    passed(G_FILES, "README.md exists")
else:
    failed(G_FILES, "README.md exists", "Create a README.md describing the plugin purpose and usage")

if file_exists("LICENSE"):
    passed(G_FILES, "LICENSE exists")
else:
    failed(G_FILES, "LICENSE exists", "Choose a license at choosealicense.com and add a LICENSE file")

manifest = read_json("manifest.json")
if manifest:
    passed(G_FILES, "manifest.json is valid JSON")
else:
    failed(G_FILES, "manifest.json is valid JSON", "manifest.json is missing or contains invalid JSON")

# ── Group 2: manifest.json fields ─────────────────────────────────────────────

G_MANIFEST = "manifest.json"

if manifest:
    for field in ["id", "name", "author", "version", "minAppVersion", "description"]:
        if manifest.get(field) not in (None, ""):
            passed(G_MANIFEST, f'"{field}" is set')
        else:
            failed(G_MANIFEST, f'"{field}" is set', f'Add "{field}" to manifest.json')

    plugin_id = manifest.get("id", "")
    if plugin_id:
        if re.search(r"obsidian", plugin_id, re.IGNORECASE):
            failed(G_MANIFEST, 'Plugin ID does not contain "obsidian"',
                   f'Current id: "{plugin_id}" — rename it')
        else:
            passed(G_MANIFEST, 'Plugin ID does not contain "obsidian"')

        if re.search(r"plugin", plugin_id, re.IGNORECASE):
            failed(G_MANIFEST, 'Plugin ID does not contain "plugin"',
                   f'Current id: "{plugin_id}" — bot rejects "plugin" in ID (e.g. use "eagle" not "eagle-plugin")')
        else:
            passed(G_MANIFEST, 'Plugin ID does not contain "plugin"')

    name = manifest.get("name", "")
    if name:
        if re.search(r"obsidian", name, re.IGNORECASE):
            failed(G_MANIFEST, 'Plugin name does not contain "Obsidian"',
                   f'Current name: "{name}" — redundant, adds clutter to the plugin list')
        else:
            passed(G_MANIFEST, 'Plugin name does not contain "Obsidian"')

    author_url = manifest.get("authorUrl", "")
    if author_url:
        remote = run(["git", "remote", "get-url", "origin"])
        if remote.returncode == 0:
            repo_name = remote.stdout.strip().rstrip(".git").split("/")[-1]
            if repo_name in author_url:
                failed(G_MANIFEST, "authorUrl does not point to the plugin repo",
                       f'"{author_url}" points to this plugin\'s repo — use your author profile URL instead')
            else:
                passed(G_MANIFEST, "authorUrl does not point to the plugin repo")

    desc = manifest.get("description", "")
    if desc:
        if len(desc) < 250:
            passed(G_MANIFEST, "Description < 250 chars")
        else:
            failed(G_MANIFEST, "Description < 250 chars", f"Current length: {len(desc)}")

        if desc.rstrip().endswith("."):
            passed(G_MANIFEST, 'Description ends with "."')
        else:
            failed(G_MANIFEST, 'Description ends with "."', "Add a period at the end")

        if not has_emoji(desc):
            passed(G_MANIFEST, "Description has no emoji")
        else:
            failed(G_MANIFEST, "Description has no emoji", "Remove emoji from description")

        if not re.match(r"this is a plugin", desc.strip(), re.IGNORECASE):
            passed(G_MANIFEST, 'Description does not start with "This is a plugin"')
        else:
            failed(G_MANIFEST, 'Description does not start with "This is a plugin"',
                   'Rewrite to start with an action verb e.g. "Searches...", "Generates..."')

        if not re.search(r"obsidian", desc, re.IGNORECASE):
            passed(G_MANIFEST, 'Description does not contain "Obsidian"')
        else:
            failed(G_MANIFEST, 'Description does not contain "Obsidian"',
                   'Bot rejects "Obsidian" in description — rephrase using "your vault" or "your notes"')

    version = manifest.get("version", "")
    if is_semver(version):
        passed(G_MANIFEST, "version follows semver (x.y.z)")
    else:
        failed(G_MANIFEST, "version follows semver (x.y.z)", f'Current: "{version}"')

    if "fundingUrl" in manifest:
        warned(G_MANIFEST, "fundingUrl present", "Remove fundingUrl if you are not accepting donations")

# ── Group 3: Version consistency ──────────────────────────────────────────────

G_VERSION = "Version Consistency"

pkg = read_json("package.json")
if manifest and pkg:
    if manifest.get("version") == pkg.get("version"):
        passed(G_VERSION, "manifest.json version == package.json version")
    else:
        failed(G_VERSION, "manifest.json version == package.json version",
               f'manifest: {manifest.get("version")}, package.json: {pkg.get("version")}')

if manifest:
    tag_result = run(["git", "describe", "--tags", "--abbrev=0"])
    if tag_result.returncode == 0:
        tag = tag_result.stdout.strip()
        expected = manifest.get("version", "")
        if tag == expected or tag == f"v{expected}":
            passed(G_VERSION, f"Latest git tag matches version ({tag})")
        else:
            warned(G_VERSION, "Latest git tag matches version",
                   f'Tag is "{tag}", expected "{expected}" — run pnpm release:* first')

        if tag.startswith("v"):
            warned(G_VERSION, 'GitHub release title must not have "v" prefix',
                   f'Tag is "{tag}" — verify your GitHub release is titled "{tag[1:]}" (not "{tag}"). Check release.yml.')
    else:
        warned(G_VERSION, "Latest git tag matches version",
               "No git tag found — run pnpm release:* to create one before submitting")

# ── Group 4: Code quality ──────────────────────────────────────────────────────

G_CODE = "Code Quality"

sample_names = grep_src(r"\b(MyPlugin|SampleSettingTab|MyPluginSettings)\b")
if sample_names:
    failed(G_CODE, "No sample class names (MyPlugin, SampleSettingTab, etc.)", f"Found:\n{sample_names}")
else:
    passed(G_CODE, "No sample class names")

var_decls = grep_src(r"\bvar ")
if var_decls:
    failed(G_CODE, "No var declarations (use const/let)", f"Found:\n{var_decls}")
else:
    passed(G_CODE, "No var declarations")

global_app = grep_src(r"(window\.app|global\.app)")
if global_app:
    failed(G_CODE, "No window.app / global.app (use this.app)", f"Found:\n{global_app}")
else:
    passed(G_CODE, "No window.app / global.app")

active_leaf = grep_src(r"workspace\.activeLeaf[^s]")
if active_leaf:
    failed(G_CODE, "No direct workspace.activeLeaf access",
           f"Use getActiveViewOfType() instead:\n{active_leaf}")
else:
    passed(G_CODE, "No direct workspace.activeLeaf access")

# ── Group 5: Platform ──────────────────────────────────────────────────────────

G_PLATFORM = "Platform"

if manifest:
    node_apis = grep_src(r"""require\(['"](?:fs|path|os|child_process|crypto)['"]\)|\bprocess\.env\b|\belectron\b""")
    if node_apis:
        if manifest.get("isDesktopOnly") is True:
            passed(G_PLATFORM, "isDesktopOnly=true (Node/Electron APIs detected)")
        else:
            failed(G_PLATFORM, "isDesktopOnly=true required",
                   f"Node/Electron API usage detected but isDesktopOnly is not true:\n{node_apis}")
    else:
        passed(G_PLATFORM, "No Node/Electron API usage detected")

# ── Output ─────────────────────────────────────────────────────────────────────

icons = {"PASS": "✅", "FAIL": "❌", "WARN": "⚠️ "}
groups = list(dict.fromkeys(r["group"] for r in results))

print("\n=== Obsidian Publish Readiness Check ===\n")

any_fail = False
for group in groups:
    print(f"── {group}")
    for r in (x for x in results if x["group"] == group):
        print(f"  {icons[r['status']]} {r['label']}")
        if r.get("hint") and r["status"] != "PASS":
            for line in r["hint"].splitlines():
                print(f"       {line}")
        if r["status"] == "FAIL":
            any_fail = True
    print()

fail_count = sum(1 for r in results if r["status"] == "FAIL")
warn_count = sum(1 for r in results if r["status"] == "WARN")
pass_count = sum(1 for r in results if r["status"] == "PASS")

print(f"Result: {pass_count} passed, {fail_count} failed, {warn_count} warnings")

if any_fail:
    print("\n❌ Plugin is NOT ready for community submission. Fix all FAIL items above.\n")
    sys.exit(1)
else:
    print("\n✅ All MUST checks passed. Proceed with community submission.\n")
    sys.exit(0)
