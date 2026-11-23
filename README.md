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
  each (such as P08R and its Q1f, R4b), each with a status dot and one plain sentence, so a
  code in a progress log says what it was. Projects write their progress in their own way,
  so the list isn't parsed from it: an agent reads the documents and writes an index
  (`prompt.md` says how), kept as `herdr-board.md` in the repository's `.git` folder: never
  committed, shared by its worktrees, gone with the clone. Its first line names the documents
  and the commit it was made at; edit it to choose other documents (files the repository
  tracks only). When those documents have new commits, the panel offers Update, which reads
  only the changes and keeps every other line, hand corrections included; a renamed document
  is followed. The pencil opens the index to correct by hand, the sparkles make it again.
  `stages.generate`, `stages.update` and `stages.refresh` can be bound to keys. The agent is
  `pi -p` with only its read and bash tools and no project instructions; set `settings.model`
  in `mods/stages/mod.json` (for example a fast, cheap model), or `settings.command` for
  another agent that prints its answer.
- `patches/better-files-path.patch`: the Files header works like Explorer's address bar.
  Click the title (or press `ctrl-l` in the tree) and the folder's full path comes up to type
  over; Enter goes there, Escape or a click elsewhere leaves it. The path is taken as typed:
  only the spaces around it are dropped, `~` is the home folder, a relative path is read from
  the folder on show, and on Windows `%VAR%` is expanded and a bare `D:` means `D:\`. A path
  that isn't there is reported as Explorer reports it, with the box left open to correct:
  `Cannot find "…". Check the spelling and try again.`, or for a folder that can't be read,
  `Access to "…" is denied. You do not have permission to open this folder.` A file shows its
  folder and opens in a tab. The header looks as before until a typed folder is on show: then
  its name is in the accent colour, and Refresh still refreshes but also goes back to the
  terminal's folder. Moving to another space, to a terminal in another folder, or a `cd` in
  the terminal goes back too; looking at a file tab doesn't.
- `patches/github-windows.patch`: the GitHub panel ran macOS `open` for links; this picks
  `rundll32 url.dll,FileProtocolHandler` on Windows and `xdg-open` on Linux (https links only,
  as before). It also says how to install `gh` when it's missing.
- `patches/sakwa-list.patch`: Sakwa as a flat block under the agents, styled like them
  (`"bare": true` in the layout; Send, All notes and the view switch become header icons), and
  no automatic right-hand dock. It also shows a note as a list: one item per line, stored as
  Markdown `- [ ]` / `- [x]`. Type in the box at the bottom and press Enter or + to add; tick
  the box to check; double-click an item to edit it in place (Enter, or a click anywhere else,
  saves; saving it empty deletes the item). Hovering an unchecked item shows a send
  icon that sends that item alone, to the same agents the whole note would go to (checked
  items are done and aren't sent); a long item also shows its full text in a wrapped card.
  The header icon switches to Sakwa's own text editor for the same note. The Tab / Space / Global buttons each name their own context on hover (the
  tab's name, the space's name). Upstream Sakwa keeps every saved snapshot forever; patched, each note keeps only its newest one (the new file is
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
- Sakwa keeps notes as files under `data/sakwa` in the Herdr home (patched: it deletes a
  note's older snapshot files there) and can send a note to an agent (`hc`).
- The Automations panel runs the `herdr-automations` CLI; the scheduler starts agents on the
  schedules you write and creates worktrees for them.
- Stages runs `git` in the focused terminal's repository every 30 seconds, and writes two
  files in its `.git` folder. Only when you press Generate or Update does it start an agent
  (`pi`, using the model you set), which reads the repository's documents and costs tokens;
  a first index of a large project took about 2–3 minutes, an update under a minute.

## License

The layout, patches, Stages mod and script are MIT ([LICENSE](LICENSE)). The mods keep their own licenses
in their upstream repositories; apart from the context lines of the patches, none of their code is copied here.
