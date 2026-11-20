#!/usr/bin/env bash
# Installs the "workbench" Herdr layout and the mods it shows, each from its
# upstream repository at a pinned commit. Never overwrites: a mod or layout
# that already exists is skipped and reported.
#
# usage: ./install.sh [--home <herdr-app home>]   (Git Bash on Windows works)
set -euo pipefail

MUNZA=https://github.com/munza/herdr-mods
MUNZA_REV=1abf4870adb4c3f7a71739db1e0c29493f5e3f95
GONZAGA=https://github.com/obrunogonzaga/herdr-mods
GONZAGA_REV=1c7bca1650321f550a94dac399f5a1e5cc1e1543
AUTOMATIONS=https://github.com/3leg0ocat/herdr-automations
AUTOMATIONS_REV=2be115a6e048ac89abe3076240a774e8ea4606da
SAKWA=https://github.com/rgonek/Sakwa
SAKWA_REV=9fb69650668c7ffcddcaac4878aa373ac343e0cd

here=$(cd "$(dirname "$0")" && pwd)
home_dir=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
while [ $# -gt 0 ]; do
  case $1 in
    --home) home_dir=$2; shift 2 ;;
    *) echo "usage: $0 [--home <dir>]" >&2; exit 2 ;;
  esac
done
mkdir -p "$home_dir/mods" "$home_dir/layouts"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# fetch <url> <rev> <dir>: one commit, no history.
fetch() {
  git init -q "$3"
  git -C "$3" config core.autocrlf false   # keep upstream's line endings
  git -C "$3" fetch -q --depth 1 "$1" "$2"
  git -C "$3" -c advice.detachedHead=false checkout -q FETCH_HEAD
}

installed=() skipped=()
# put <source folder> <name>
put() {
  if [ -e "$home_dir/mods/$2" ]; then skipped+=("mods/$2"); return 1; fi
  cp -R "$1" "$home_dir/mods/$2"
  installed+=("mods/$2")
}

echo "fetching mods..."
fetch "$MUNZA" "$MUNZA_REV" "$work/munza"
fetch "$GONZAGA" "$GONZAGA_REV" "$work/gonzaga"
fetch "$AUTOMATIONS" "$AUTOMATIONS_REV" "$work/automations"
fetch "$SAKWA" "$SAKWA_REV" "$work/sakwa"

for m in better-files better-changes better-tabs better-icons; do
  put "$work/munza/$m/mods/$m" "$m" || true
done
if put "$work/gonzaga/github-panel/mods/github" github; then
  (cd "$home_dir" && git apply "$here/patches/github-windows.patch")
fi
put "$work/gonzaga/github-panel/mods/issue-agent" issue-agent || true
put "$work/automations/app/mods/automations" automations || true
if put "$work/sakwa/mods/sakwa" sakwa; then
  (cd "$home_dir" && git apply "$here/patches/sakwa-list.patch")
fi

for f in workbench.json workbench.svg; do
  if [ -e "$home_dir/layouts/$f" ]; then skipped+=("layouts/$f")
  else cp "$here/layouts/$f" "$home_dir/layouts/$f"; installed+=("layouts/$f"); fi
done

echo "installed: ${installed[*]:-nothing}"
echo "skipped (already there): ${skipped[*]:-nothing}"

if command -v herdr-app >/dev/null 2>&1; then
  for m in better-files better-changes better-tabs better-icons github issue-agent automations sakwa; do
    herdr-app check "$home_dir/mods/$m" 2>&1 | tail -1
  done
fi

cat <<EOF

Next:
  herdr-app do layout.switch --name workbench
  GitHub panel: install gh (https://cli.github.com) and run gh auth login.
  Automations panel: build and start the scheduler, see README.md.
EOF
