#!/usr/bin/env python3
"""
submit-community-pr.py
Run from a plugin's root directory:
  python3 <path-to-skill>/scripts/submit-community-pr.py

Automates Phase 3 of community plugin submission:
1. Reads manifest.json to get plugin metadata
2. Syncs your fork of obsidianmd/obsidian-releases with upstream
3. Creates branch add-<plugin-id>
4. Appends entry at END of community-plugins.json
5. Commits and pushes
6. Opens a PR using the exact official template

Prerequisites:
- gh CLI authenticated
- You have forked obsidianmd/obsidian-releases to your GitHub account
"""

import json
import os
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

cwd = Path.cwd()

TEMPLATE_URL = (
    "https://raw.githubusercontent.com/obsidianmd/obsidian-releases"
    "/refs/heads/master/.github/PULL_REQUEST_TEMPLATE/plugin.md"
)

TEMPLATE_FALLBACK = """# I am submitting a new Community Plugin

- [ ] I attest that I have done my best to deliver a high-quality plugin, am proud of the code I have written, and would recommend it to others. I commit to maintaining the plugin and being responsive to bug reports. If I am no longer able to maintain it, I will make reasonable efforts to find a successor maintainer or withdraw the plugin from the directory.

## Repo URL

<!--- Paste a link to your repo here for easy access -->
Link to my plugin:

## Release Checklist
- [ ] I have tested the plugin on
  - [ ]  Windows
  - [ ]  macOS
  - [ ]  Linux
  - [ ]  Android _(if applicable)_
  - [ ]  iOS _(if applicable)_
- [ ] My GitHub release contains all required files (as individual files, not just in the source.zip / source.tar.gz)
  - [ ] `main.js`
  - [ ] `manifest.json`
  - [ ] `styles.css` _(optional)_
- [ ] GitHub release name matches the exact version number specified in my manifest.json (_**Note:** Use the exact version number, don't include a prefix `v`_)
- [ ] The `id` in my `manifest.json` matches the `id` in the `community-plugins.json` file.
- [ ] My README.md describes the plugin's purpose and provides clear usage instructions.
- [ ] I have read the developer policies at https://docs.obsidian.md/Developer+policies, and have assessed my plugin's adherence to these policies.
- [ ] I have read the tips in https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines and have self-reviewed my plugin to avoid these common pitfalls.
- [ ] I have added a license in the LICENSE file.
- [ ] My project respects and is compatible with the original license of any code from other plugins that I'm using.
      I have given proper attribution to these other projects in my `README.md`."""


def run(cmd, **kwargs):
    return subprocess.run(cmd, capture_output=True, text=True, **kwargs)


def run_or_die(cmd, **kwargs):
    result = run(cmd, **kwargs)
    if result.returncode != 0:
        print(f"\n❌ Command failed: {' '.join(str(c) for c in cmd)}")
        print(result.stderr or result.stdout or "(no output)")
        sys.exit(1)
    return result.stdout.strip()


# ── Read manifest ──────────────────────────────────────────────────────────────

try:
    manifest = json.loads((cwd / "manifest.json").read_text())
except Exception:
    print("❌ manifest.json not found or invalid. Run from a plugin root directory.")
    sys.exit(1)

plugin_id = manifest.get("id")
name = manifest.get("name")
author = manifest.get("author")
description = manifest.get("description")

if not all([plugin_id, name, author, description]):
    print("❌ manifest.json is missing required fields: id, name, author, description")
    sys.exit(1)

# ── Infer repo slug from git remote ───────────────────────────────────────────

remote_url = run_or_die(["git", "remote", "get-url", "origin"], cwd=cwd)
# Extract owner/repo from https://github.com/owner/repo or git@github.com:owner/repo
remote_clean = remote_url.removesuffix(".git")
parts = remote_clean.replace(":", "/").split("/")
repo_slug = "/".join(parts[-2:])  # owner/repo
repo_url = f"https://github.com/{repo_slug}"
github_user = repo_slug.split("/")[0]

print(f"\nPlugin: {name} ({plugin_id})")
print(f"Repo:   {repo_slug}")
print(f"Author: {author}\n")

# ── Clone/update fork ─────────────────────────────────────────────────────────

releases_dir = Path(tempfile.gettempdir()) / "obsidian-releases"

if not releases_dir.exists():
    print("Cloning fork...")
    run_or_die(["gh", "repo", "clone", f"{github_user}/obsidian-releases", str(releases_dir)])
else:
    print("Fork already cloned, updating...")

# Add upstream if not already set
remotes = run(["git", "remote"], cwd=releases_dir).stdout
if "upstream" not in remotes:
    run_or_die(
        ["git", "remote", "add", "upstream",
         "https://github.com/obsidianmd/obsidian-releases.git"],
        cwd=releases_dir,
    )

# Sync with upstream
print("Syncing with upstream...")
run_or_die(["git", "checkout", "master"], cwd=releases_dir)
run_or_die(["git", "fetch", "upstream"], cwd=releases_dir)
rebase = run(["git", "rebase", "upstream/master"], cwd=releases_dir)
if rebase.returncode != 0:
    print("⚠️  Rebase failed, resetting to upstream/master...")
    run_or_die(["git", "reset", "--hard", "upstream/master"], cwd=releases_dir)
run_or_die(["git", "push", "origin", "master", "--force"], cwd=releases_dir)

# ── Create branch ─────────────────────────────────────────────────────────────

branch = f"add-{plugin_id}"
print(f"\nCreating branch: {branch}")

branch_check = run(["git", "show-ref", "--verify", f"refs/heads/{branch}"], cwd=releases_dir)
if branch_check.returncode == 0:
    run_or_die(["git", "checkout", "master"], cwd=releases_dir)
    run_or_die(["git", "branch", "-D", branch], cwd=releases_dir)
run_or_die(["git", "checkout", "-b", branch], cwd=releases_dir)

# ── Append entry to community-plugins.json ────────────────────────────────────

plugins_file = releases_dir / "community-plugins.json"
plugins = json.loads(plugins_file.read_text())

existing = next((p for p in plugins if p["id"] == plugin_id), None)
if existing:
    print(f'❌ Plugin id "{plugin_id}" already exists in community-plugins.json!')
    print(f"  Existing entry: {json.dumps(existing)}")
    sys.exit(1)

entry = {"id": plugin_id, "name": name, "author": author, "description": description, "repo": repo_slug}
plugins.append(entry)
plugins_file.write_text(json.dumps(plugins, indent=2) + "\n")
print(f"✅ Appended entry at index {len(plugins) - 1} (end of list)")

# ── Commit and push ───────────────────────────────────────────────────────────

run_or_die(["git", "add", "community-plugins.json"], cwd=releases_dir)
run_or_die(["git", "commit", "-m", f"Add plugin: {name}"], cwd=releases_dir)
run_or_die(["git", "push", "origin", branch, "--force"], cwd=releases_dir)
print(f"✅ Pushed branch: {branch}")

# ── Fetch PR body from official template URL ──────────────────────────────────

print("Fetching official PR template...")
try:
    with urllib.request.urlopen(TEMPLATE_URL, timeout=10) as resp:
        template_text = resp.read().decode()
except Exception as e:
    print(f"⚠️  Could not fetch template ({e}), using bundled fallback.")
    template_text = TEMPLATE_FALLBACK

# Fill in the repo URL
pr_body = template_text.replace("Link to my plugin:", f"Link to my plugin: {repo_url}")

# Check applicable boxes (keep unchecked: Windows, Linux, Android, iOS, styles.css)
keep_unchecked = ["Windows", "Linux", "Android", "iOS", "styles.css"]
lines = []
for line in pr_body.splitlines():
    if "- [ ]" in line and not any(kw in line for kw in keep_unchecked):
        line = line.replace("- [ ]", "- [x]", 1)
    lines.append(line)
pr_body = "\n".join(lines)

body_file = Path(tempfile.gettempdir()) / f"pr-body-{plugin_id}.md"
body_file.write_text(pr_body)

# ── Open PR ───────────────────────────────────────────────────────────────────

print("\nOpening community PR...")
pr_result = run([
    "gh", "pr", "create",
    "--repo", "obsidianmd/obsidian-releases",
    "--head", f"{github_user}:{branch}",
    "--base", "master",
    "--title", f"Add plugin: {name}",
    "--body-file", str(body_file),
])

if pr_result.returncode != 0:
    print("❌ Failed to create PR:")
    print(pr_result.stderr or pr_result.stdout)
    sys.exit(1)

pr_url = pr_result.stdout.strip()
print(f"\n✅ Community PR opened: {pr_url}")
print("\nNext steps:")
print("  1. Wait a few minutes for the bot to validate")
print("  2. Check for \"Validation failed\" label and fix any issues")
print(f"  3. If bot rejects, fix and re-trigger validation:")
print(f"     cd {releases_dir}")
print(f"     git checkout {branch}")
print(f"     git commit --allow-empty -m 're-trigger validation'")
print(f"     git push origin {branch}")
print("     (or just re-run this script — it force-pushes)")
print("  4. Once \"Ready for review\", wait for a human reviewer")
