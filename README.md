# herdr-config

My [Herdr](https://herdr.dev) desktop-app setup: a `workbench` layout with Files, Changes,
GitHub and Automations panels on the right, opened from buttons in the tab bar, and a notes
list in the sidebar. It's put together from other people's mods, so this repository only
holds what I wrote: the layout, two patches, and a script that installs everything else from its upstream repository at a
pinned commit.

## What's in the window

- **Left**: Herdr's own spaces and agents sidebar, unchanged from the shipped `main` layout,
  with Notes under the agents.
- **Top**: [Better Tabs](https://github.com/munza/herdr-mods/tree/main/better-tabs), with
  Files, Changes, GitHub and Automations buttons on the right.
- **Right**: a 368px panel. Each space remembers which panel it last showed.

| Button | Mod | Source |
| --- | --- | --- |
| Files | `better-files` (+ `better-icons` for colour file icons) | [munza/herdr-mods](https://github.com/munza/herdr-mods) `1abf487`, Apache-2.0 |
| Changes | `better-changes` (also draws the pane headers) | same |
| GitHub | `github`, `issue-agent` | [obrunogonzaga/herdr-mods](https://github.com/obrunogonzaga/herdr-mods) `1c7bca1`, MIT, patched |
| Automations | `automations` | [3leg0ocat/herdr-automations](https://github.com/3leg0ocat/herdr-automations) `windows`, MIT |
| (sidebar) Notes | `sakwa` | [rgonek/Sakwa](https://github.com/rgonek/Sakwa) `9fb6965`, Apache-2.0, patched |

## Files here

- `layouts/workbench.json`, `layouts/workbench.svg`: the layout and its preview in Settings.
- `patches/github-windows.patch`: the GitHub panel ran macOS `open` for links; this picks
  `rundll32 url.dll,FileProtocolHandler` on Windows and `xdg-open` on Linux (https links only,
  as before). It also says how to install `gh` when it's missing.
- `patches/sakwa-list.patch`: Sakwa as a flat block under the agents, styled like them
  (`"bare": true` in the layout; Send, All notes and the view switch become header icons), and
  no automatic right-hand dock. It also shows a note as a list: one item per line, stored as
  Markdown `- [ ]` / `- [x]`. Type in the box at the bottom and press Enter or + to add; tick
  the box to check; double-click an item to edit it; hover shows the ×, and a long item's full
  text in a wrapped card. The header icon switches to Sakwa's own text editor for the same
  note. The Tab / Space / Global buttons each name their own context on hover (the tab's name,
  the space's name). Upstream Sakwa keeps
  every saved snapshot forever; patched, each note keeps only its newest one (the new file is
  written before the old one is deleted), so there is no history to go back to beyond the
  editor's own undo.
- `install.sh`: fetches the mods above at their pinned commits, applies the patches, copies the
  layout. Anything already installed under the same name is skipped, never overwritten.

## Install

Needs Git and bash (Git Bash on Windows).

```sh
git clone https://github.com/3leg0ocat/herdr-config
cd herdr-config
./install.sh              # or --home <dir>; default $HERDR_APP_HOME or ~/.config/herdr-app
herdr-app do layout.switch --name workbench
```

`ctrl-shift-l` switches back to your previous layout. To remove it, delete
`layouts/workbench.*` and the mod folders the script listed as installed.

**GitHub panel**: install [gh](https://cli.github.com) and run `gh auth login`. It shows the
open PRs and issues of the repository the focused terminal is in. In a fork with an
`upstream` remote, `gh repo set-default` picks which one.

**Automations panel**: the panel talks to the `herdr-automations` scheduler, which has to be
built and started once. On Windows (Go 1.26+):

```powershell
git clone -b windows https://github.com/3leg0ocat/herdr-automations
cd herdr-automations
go build -o $HOME\.local\bin\herdr-automations.exe .   # any folder on PATH
herdr-automations service install                      # starts at logon, hidden
```

Then put `backend: hc` (and, if you like, `auto_cleanup: true`) at the top of the
`automations.yaml` that `herdr-automations list` names. Claude Code asks once per untrusted
folder before it starts working; trust `~/.herdr/worktrees` once and every run worktree
under it is covered.

## What these mods do on your machine

Mods are unsandboxed code. Before installing, know that:

- Better Files and Better Changes run `git`, `sh` and PowerShell locally; Better Files
  downloads pictures a Markdown file links to (`curl`) and can send a file path to an agent
  (`hc`).
- The GitHub panel runs `gh`, which talks to GitHub. Its Agent button creates a git worktree
  and starts an agent there.
- Sakwa keeps notes as files under `data/sakwa` in the Herdr home (patched: it deletes a
  note's older snapshot files there) and can send a note to an agent (`hc`).
- The Automations panel runs the `herdr-automations` CLI; the scheduler starts agents on the
  schedules you write and creates worktrees for them.

## License

The layout, patch and script are MIT ([LICENSE](LICENSE)). The mods keep their own licenses
in their upstream repositories; apart from the context lines of the patches, none of their code is copied here.
