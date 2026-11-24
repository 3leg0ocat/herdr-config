# herdr-config

My [Herdr](https://herdr.dev) desktop-app setup: a `workbench` layout with Files, Changes,
GitHub, Automations and Stages panels on the right, opened from buttons in the tab bar, and a
notes list in the sidebar. It's mostly put together from other people's mods, so this
repository holds what I wrote: the layout, three patches, the Stages mod, and a script that
installs everything else from its upstream repository at a pinned commit.

## What's in the window

- **Left**: Herdr's own spaces and agents sidebar, unchanged from the shipped `main` layout,
  with Notes under the agents.
- **Top**: [Better Tabs](https://github.com/munza/herdr-mods/tree/main/better-tabs), with
  Files, Changes, GitHub and Automations buttons on the right.
- **Right**: a 368px panel. Each space remembers which panel it last showed.

| Button | Mod | Source |
| --- | --- | --- |
| Files | `better-files` (+ `better-icons` for colour file icons) | [munza/herdr-mods](https://github.com/munza/herdr-mods) `1abf487`, Apache-2.0, patched |
| Changes | `better-changes` (also draws the pane headers) | same |
| GitHub | `github`, `issue-agent` | [obrunogonzaga/herdr-mods](https://github.com/obrunogonzaga/herdr-mods) `1c7bca1`, MIT, patched |
| Automations | `automations` | [3leg0ocat/herdr-automations](https://github.com/3leg0ocat/herdr-automations) `windows`, MIT |
| Stages | `stages` | this repository, MIT |
| (sidebar) Notes | `sakwa` | [rgonek/Sakwa](https://github.com/rgonek/Sakwa) `9fb6965`, Apache-2.0, patched |

## Files here

- `layouts/workbench.json`, `layouts/workbench.svg`: the layout and its preview in Settings.
- `mods/stages`: the development stages of the focused terminal's repository and the steps in
  each, with status and a one-line summary.
  - An agent reads the project's progress documents and writes an index, `herdr-board.md` in
    the repository's `.git` folder (never committed, shared by its worktrees). `prompt.md` is
    its prompt.
  - The index's first line names its source documents and commit; edit it to choose others.
    When they change, Update rereads only what changed and keeps hand edits.
  - Done and not-started stages fold; a stage in progress shows its open steps and its latest
    done ones.
  - Commands: `stages.generate`, `stages.update`, `stages.refresh`. The agent is `pi -p` with
    read and bash only; set `settings.model` or `settings.command` in `mod.json`.
- `patches/better-files-path.patch`: an editable path in the Files header, like Explorer's
  address bar (click the title or press `ctrl-l`). Accepts `~`, relative paths and, on
  Windows, `%VAR%` and bare drive letters; a file opens in a tab. Refresh, switching space or a
  `cd` returns to the terminal's folder.
- `patches/github-windows.patch`: opens links with the platform's handler on Windows and Linux
  (upstream uses macOS `open`), and says how to install `gh` when it's missing.
- `patches/sakwa-list.patch`: Sakwa as a flat block under the agents (`"bare": true`), without
  the automatic right-hand dock.
  - List view: one Markdown task per line. Add, check (checked items sink), double-click to
    edit, drag to reorder; a hover icon sends a single item to an agent.
  - Keeps only the newest snapshot of each note.
  - All notes: one row per note with its status; hover icons move a note to the focused tab,
    space or Global (merging into a note already there) or delete it.
- `install.sh`: fetches the mods above at their pinned commits, applies the patches and copies
  the layout. Anything already installed is skipped, never overwritten.

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
installed and started once. On Windows, in PowerShell (upstream's installer, fetching this fork's
build; run the first two lines again to update):

```powershell
$env:HERDR_AUTOMATIONS_RELEASES_URL = "https://github.com/3leg0ocat/herdr-automations/releases"
irm https://raw.githubusercontent.com/3leg0ocat/herdr-automations/windows/scripts/install.ps1 | iex
herdr-automations service install     # once; starts the scheduler now and at every login
```

On Windows it always runs agents through hc. To have run worktrees removed when nothing in
them is needed any more, put `auto_cleanup: true` at the top of the `automations.yaml` that
`herdr-automations list` names. Claude Code asks once per untrusted
folder before it starts working; trust `~/.herdr/worktrees` once and every run worktree
under it is covered.

## What these mods do on your machine

Mods are unsandboxed code. Before installing, know that:

- Better Files and Better Changes run `git`, `sh` and PowerShell locally; Better Files
  downloads pictures a Markdown file links to (`curl`) and can send a file path to an agent
  (`hc`).
- The GitHub panel runs `gh`, which talks to GitHub. Its Agent button creates a git worktree
  and starts an agent there.
- Sakwa keeps notes as files under `data/sakwa` in the Herdr home and can send a note to an
  agent (`hc`). Patched, it deletes a note's older snapshots, and all its files when the note
  is deleted in All notes.
- The Automations panel runs the `herdr-automations` CLI; the scheduler starts agents on the
  schedules you write and creates worktrees for them.
- Stages runs `git` in the focused terminal's repository every 30 seconds, and writes three
  files in its `.git` folder. Only when you press Generate or Update does it start an agent
  (`pi`, using the model you set), which reads the repository's documents and costs tokens;
  a first index of a large project took about 3–5 minutes, a small one under a minute, an
  update under a minute.

## License

The layout, patches, Stages mod and script are MIT ([LICENSE](LICENSE)). The mods keep their own licenses
in their upstream repositories; apart from the context lines of the patches, none of their code is copied here.
