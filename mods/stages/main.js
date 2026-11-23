// Stages: the development stages of the focused terminal's repository, and the steps in each,
// each with its status and one plain sentence, so a code such as "M2" or "Q1f" says what it was.
//
// The list is an index an agent makes from the project's own documents (prompt.md), kept in
// the repository's .git folder: never committed, shared by its worktrees, gone with the
// clone. Its first line names the documents and the commit it was made at; when they have
// changed since, the panel offers to bring it up to date from the changes alone. A person may
// correct the file by hand; an update keeps what it doesn't touch.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { appHome, checking, exec, focused, nextCommand, readTextFile, setShared, shared, spaces, theme, window, writeTextFile } from "herdr";
import { fromAgent, parseIndex, withHeader } from "./index.js";

const FILE = "herdr-board.md";
const REQUEST = "herdr-board.request.md";
const LOOSE = "herdr-board.loose.json";
const BUSY = "stages.busy";
const FOLLOW_MS = 500;
const CHECK_MS = 30000;
const AGENT_MS = 600000;
const TEXT = { badge: 10, caption: 11, small: 12, body: 13 };
const INDENT = 14;
// The done steps a stage in progress shows: at least this many however small the panel, at
// most this many however tall.
const MIN_RECENT = 1;
const MAX_RECENT = 4;
// Between the stage in progress and the stages not started yet.
const GROUP_GAP = 10;

const Icon = (name, size = 14) => svg(`mods/stages/icons/${name}.svg`).size(size).flex_none();

async function git(cwd, args) {
  const r = await exec("git", ["--no-optional-locks", "-c", "core.quotepath=off", ...args], { cwd });
  if (r.code !== 0) throw new Error(r.stderr.trim() || `git ${args[0]} failed.`);
  return r.stdout;
}

// The files a source (a file or a folder) names inside the work tree, tracked or not, ignored
// ones included: a project may keep its plans in a folder Git ignores. Nothing outside it.
async function filesOf(top, source) {
  const r = await exec("git", ["--no-optional-locks", "-c", "core.quotepath=off", "ls-files", "-co", "-z", "--", source], { cwd: top });
  return r.code === 0 ? r.stdout.split("\0").filter(Boolean) : [];
}

// What the sources' files that Git doesn't track hold now, by path: commits can't say when
// they change, so their contents are compared.
async function looseHashes(top, sources) {
  const files = [...new Set((await Promise.all(sources.map((s) => filesOf(top, s)))).flat())];
  if (!files.length) return {};
  const tracked = new Set((await git(top, ["ls-files", "-c", "-z", "--", ...files])).split("\0").filter(Boolean));
  const loose = files.filter((f) => !tracked.has(f));
  if (!loose.length) return {};
  const hashes = (await git(top, ["hash-object", "--", ...loose])).trim().split(/\s+/);
  return Object.fromEntries(loose.map((f, i) => [f, hashes[i]]));
}

// pi, read-only tools, no project instructions: the agent only reads and prints.
async function agentCommand() {
  let settings = {};
  try {
    settings = JSON.parse((await readTextFile(`${appHome()}/mods/stages/mod.json`)) ?? "{}").settings ?? {};
  } catch {}
  if (Array.isArray(settings.command) && settings.command.length) return settings.command;
  const pi = window()?.platform === "windows" ? "pi.cmd" : "pi";
  const model = settings.model ? ["--model", settings.model] : [];
  return [pi, "-p", "--no-session", "-nc", "-ns", "-np", "--no-mcp", "-t", "read,bash", ...model];
}

function openWithDefault(path) {
  const platform = window()?.platform;
  if (platform === "windows")
    return exec("powershell.exe", ["-NoProfile", "-NoLogo", "-Command", "& { Invoke-Item -LiteralPath $args[0] } '" + path.replace(/'/g, "''") + "'"]);
  return exec(platform === "macos" ? "open" : "xdg-open", [path]);
}

export default class Stages extends View {
  init(_props, cx) {
    this.repo = null; // { top, file, name }
    this.text = null;
    this.index = null;
    this.stale = null; // { commits, missing: [...] } or { unknown: true }
    this.opened = new Map(); // repository → stages shown open, by code or name
    if (checking()) return;
    cx.timer.every(FOLLOW_MS, (cx) => this.follow(cx));
    cx.timer.every(CHECK_MS, (cx) => this.load(cx));
    this.follow(cx);
    // For keys: stages.generate, stages.update, stages.refresh.
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "generate") this.generate(cx, false);
        else if (command === "update" && this.stale && !this.stale.unknown && !this.stale.missing.length) this.generate(cx, true);
        else if (command === "refresh") this.load(cx, true);
      }
    });
  }

  // The focused terminal's folder; a file tab or another panel keeps the last one.
  folder() {
    const f = focused();
    if (f?.terminal) this.remote = f.terminal.includes("/");
    if (f?.terminal && f.cwd) this.cwd = f.cwd;
    if (!this.cwd) {
      const space = spaces().find((s) => s.active);
      if (space && !space.machine) this.cwd = space.folder || null;
    }
    return this.remote ? null : this.cwd;
  }

  follow(cx) {
    const cwd = this.folder();
    if (cwd === this.followed) return;
    this.followed = cwd;
    this.load(cx, true);
  }

  // Which repository, its index, and whether its documents have moved on since.
  load(cx, moved = false) {
    const cwd = this.followed;
    if (!cwd) {
      this.repo = null;
      return cx.notify();
    }
    if (this.loading && !moved) return;
    this.loading = cwd;
    cx.spawn(async (cx) => {
      try {
        const top = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
        const common = (await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim();
        if (this.followed !== cwd) return;
        const repo = { top, common, file: `${common}/${FILE}`, name: top.split("/").pop() };
        const text = await readTextFile(repo.file);
        this.repo = repo;
        this.error = null;
        if (text !== this.text || moved) {
          this.text = text;
          this.index = text ? parseIndex(text) : null;
        }
        this.stale = this.index?.sources.length ? await this.staleness(repo) : null;
      } catch (e) {
        if (this.followed !== cwd) return;
        this.repo = null;
        this.text = null;
        this.index = null;
        this.error = /not a git repository/i.test(e.message ?? "") ? null : (e.message ?? String(e));
      } finally {
        if (this.loading === cwd) this.loading = null;
        cx.notify();
      }
    });
  }

  // What changed in the documents since the index was made: commits to the tracked ones,
  // contents of the others. A renamed tracked document is followed (the index's first line is
  // rewritten); one that is gone is reported.
  async staleness(repo) {
    const { sources, commit } = this.index;
    let current = sources;
    let commits = 0;
    if (commit) {
      const known = await exec("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: repo.top });
      if (known.code !== 0) return { unknown: true };
      const changes = (await git(repo.top, ["diff", "--name-status", "-z", "-M", "--diff-filter=R", commit, "HEAD"])).split("\0");
      const renamed = new Map();
      for (let i = 0; i < changes.length; i += 3) if (changes[i]?.startsWith("R")) renamed.set(changes[i + 1], changes[i + 2]);
      current = sources.map((s) => renamed.get(s) ?? s);
      if (sources.some((s) => renamed.has(s))) {
        const text = withHeader(this.text, current, commit);
        await writeTextFile(repo.file, text, this.text);
        this.text = text;
        this.index = parseIndex(text);
      }
      commits = Number((await git(repo.top, ["rev-list", "--count", `${commit}..HEAD`, "--", ...current])).trim());
    }
    const missing = [];
    for (const s of current) if (!(await filesOf(repo.top, s)).length) missing.push(s);
    let saved = {};
    try {
      saved = JSON.parse((await readTextFile(`${repo.common}/${LOOSE}`)) ?? "{}");
    } catch {}
    const now = await looseHashes(repo.top, current);
    const changed = [...new Set([...Object.keys(saved), ...Object.keys(now)])].filter((f) => saved[f] !== now[f] && now[f]);
    return commits || missing.length || changed.length ? { commits, missing, changed } : null;
  }

  // A run is shared by every copy. One that a reload cut off is forgotten after the longest
  // an agent may take.
  busy() {
    const at = this.repo && (shared(BUSY) ?? {})[this.repo.top];
    return Boolean(at) && Date.now() - at < AGENT_MS + 60000;
  }

  setBusy(top, on) {
    const busy = { ...(shared(BUSY) ?? {}) };
    if (on) busy[top] = Date.now();
    else delete busy[top];
    setShared(BUSY, busy);
  }

  // update: from the changes since the index's commit; otherwise from the documents whole.
  generate(cx, update) {
    const repo = this.repo;
    if (!repo || this.busy()) return;
    const old = update ? this.index : null;
    const stale = this.stale;
    const text = this.text;
    this.error = null;
    this.setBusy(repo.top, true);
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const head = (await git(repo.top, ["rev-parse", "--short=10", "HEAD"])).trim();
        let request = (await readTextFile(`${appHome()}/mods/stages/prompt.md`)) ?? "";
        const sources = this.index?.sources ?? [];
        if (sources.length) request += `\n## The files to use\n\nUse these files and no others: ${sources.join(", ")}.\n`;
        if (old) {
          const files = sources.map((s) => `'${s}'`).join(" ");
          const read = [];
          if (old.commit && stale?.commits)
            read.push(
              `the commits since ${old.commit} (\`git log --oneline ${old.commit}..HEAD -- ${files}\`, then ` +
                `\`git diff ${old.commit} HEAD -- ${files}\`), not the whole files`,
            );
          if (stale?.changed?.length)
            read.push(`these files, which Git doesn't track and which changed since: ${stale.changed.join(", ")}; read only their parts about stages`);
          request +=
            `\n## This time: bring an index up to date\n\nThe index below may be out of date. Read ${read.join("; and ")}. ` +
            "Print the whole index again with those changes applied: add new stages and steps, and change the " +
            "statuses and sentences they affect. Keep every other line exactly as it is: a person may have " +
            `corrected it.\n\n${text.trim()}\n`;
        }
        const requestFile = `${repo.common}/${REQUEST}`;
        await writeTextFile(requestFile, request, await readTextFile(requestFile));
        const [program, ...args] = await agentCommand();
        const r = await exec(program, [...args, `@${requestFile}`, "Do what the attached file asks."], {
          cwd: repo.top,
          timeout: AGENT_MS,
        });
        if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").slice(-3).join("\n") || `${program} exited with ${r.code}.`);
        const out = fromAgent(r.stdout);
        // Only files and folders inside this repository's work tree can be a source; the
        // agent's order is kept.
        const kept = [];
        for (const s of out.sources) if ((await filesOf(repo.top, s)).length) kept.push(s);
        if (!kept.length && !out.none) throw new Error("The agent named no file of this repository as its source, so its answer wasn't saved.");
        const made = withHeader(out.body, kept, head);
        const looseFile = `${repo.common}/${LOOSE}`;
        await writeTextFile(looseFile, JSON.stringify(await looseHashes(repo.top, kept)), await readTextFile(looseFile));
        await writeTextFile(repo.file, made, await readTextFile(repo.file));
        if (this.repo?.top === repo.top) {
          this.text = made;
          this.index = parseIndex(made);
          this.stale = null;
        }
      } catch (e) {
        if (this.repo?.top === repo.top) this.error = e.message ?? String(e);
      } finally {
        this.setBusy(repo.top, false);
        cx.notify();
      }
    });
  }

  // What a click opened or closed, per repository, over what shows open at first.
  isOpen(key, first) {
    const open = this.opened.get(this.repo.top);
    return open?.has(key) ? open.get(key) : first;
  }

  toggle(key, first, cx) {
    if (!this.opened.has(this.repo.top)) this.opened.set(this.repo.top, new Map());
    this.opened.get(this.repo.top).set(key, !this.isOpen(key, first));
    cx.notify();
  }

  // --- Drawing, in Files' look ---

  iconButton(t, id, icon, label, onClick) {
    return div()
      .id(id)
      .size(26)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(6)
      .text_color(t.dim)
      .cursor_pointer()
      .accessibility_label(label)
      .tooltip(label)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => onClick(cx))
      .child(Icon(icon, 15));
  }

  textButton(t, id, label, onClick) {
    return div()
      .id(id)
      .flex_none()
      .h(24)
      .px(10)
      .flex()
      .items_center()
      .rounded(6)
      .border_1()
      .border_color(t.border)
      .text_size(TEXT.small)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => onClick(cx))
      .child(label);
  }

  message(t, text, error = false) {
    return div().flex_none().p(8).text_size(TEXT.small).whitespace_normal().text_color(error ? t.ansi1 : t.dim).child(text);
  }

  dot(t, status) {
    const el = div().size(8).flex_none().rounded(4);
    if (status === "done") return el.bg(t.ansi2);
    if (status === "doing") return el.bg(t.working);
    return el.border_1().border_color(t.dim);
  }

  // Roughly how tall a row draws, so the list can tell what fits: the name's line and the
  // sentence wrapped at the panel's width (a CJK character about 11px wide, other text 6).
  rowHeight(entry, depth) {
    const width = Math.max(80, (this.size?.width ?? 368) - 2 - 12 - (8 + depth * INDENT) - 8 - 34);
    let px = 0;
    for (const ch of entry.note ?? "") px += ch.charCodeAt(0) >= 0x2e80 ? 11 : 6;
    // Measured in the window: 6 of padding, 20 for the name, 18 for each line of the sentence.
    return 6 + 20 + Math.ceil(px / width) * 18;
  }

  // A folded group: its name and how many.
  groupRow(t, group, open, depth = 0) {
    return h_flex()
      .id(group.key)
      .flex_none()
      .h(26)
      .pl(8 + depth * INDENT)
      .pr(8)
      .gap(6)
      .items_center()
      .rounded(7)
      .text_size(TEXT.small)
      .text_color(t.muted)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.toggle(group.key, group.first, cx))
      .child(div().w(14).flex_none().flex().justify_center().text_color(t.dim).child(Icon(open ? "chevron-down" : "chevron-right", 12)))
      .child(div().flex_none().font_medium().child(group.label))
      .child(div().flex_none().text_color(t.dim).child(String(group.count)));
  }

  row(t, entry, id, depth, open = null, key = null, first = false) {
    const done = entry.status === "done";
    return v_flex()
      .id(id)
      .flex_none()
      .py(3)
      .pl(8 + depth * INDENT)
      .pr(8)
      .rounded(7)
      .text_size(TEXT.small)
      .when(open !== null, (el) =>
        el
          .cursor_pointer()
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.toggle(key, first, cx)),
      )
      .child(
        h_flex()
          .gap(6)
          .min_w(0)
          .items_center()
          .child(
            div()
              .w(14)
              .flex_none()
              .flex()
              .justify_center()
              .text_color(t.dim)
              .when(open !== null, (el) => el.child(Icon(open ? "chevron-down" : "chevron-right", 12))),
          )
          .child(this.dot(t, entry.status))
          .when(Boolean(entry.code), (el) => el.child(div().flex_none().font_medium().child(entry.code)))
          .child(div().flex_1().min_w(0).truncate().text_color(done ? t.muted : t.foreground).child(entry.name)),
      )
      .when(Boolean(entry.note), (el) =>
        el.child(div().pl(34).text_size(TEXT.caption).text_color(t.dim).whitespace_normal().child(entry.note)),
      );
  }

  header(t) {
    const busy = this.busy();
    return h_flex()
      .h(42)
      .flex_none()
      .px(14)
      .gap(8)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .child(
        h_flex()
          .flex_1()
          .min_w(0)
          .gap(6)
          .items_center()
          .child(div().flex_none().font_medium().child("Stages"))
          .when(Boolean(this.repo), (el) =>
            el.child(
              div()
                .flex_shrink(1)
                .min_w(0)
                .truncate()
                .px(5)
                .py(1)
                .rounded(4)
                .border_1()
                .border_color(t.border)
                .text_size(TEXT.badge)
                .text_color(t.muted)
                .child(this.repo.name),
            ),
          ),
      )
      .when(busy, (el) => el.child(div().size(26).flex().items_center().justify_center().child(svg("mods/workspace-chrome/spinner.svg").size(14).text_color(t.dim).spin(900))))
      .when(Boolean(this.text && !busy), (el) =>
        el
          .child(this.iconButton(t, "stages-edit", "pencil", "Edit the index", () => openWithDefault(this.repo.file)))
          .child(this.iconButton(t, "stages-regenerate", "sparkles", "Make the index again from the documents", (cx) => this.generate(cx, false))),
      );
  }

  render() {
    const t = theme();
    const root = v_flex()
      .id("stages")
      .size_full()
      .min_w(0)
      .min_h(0)
      .overflow_hidden()
      .bg(t.background)
      .text_color(t.foreground)
      .text_size(TEXT.body)
      .rounded(10)
      .border_1()
      .border_color(t.border)
      // How much the list shows depends on the room it has.
      .on_size_change((size, cx) => {
        if (size.width === this.size?.width && size.height === this.size?.height) return;
        this.size = size;
        cx.notify();
      })
      .child(this.header(t));
    if (this.error) root.child(this.message(t, this.error, true));
    if (this.busy())
      root.child(this.message(t, "An agent is reading the project's documents to write the index. It takes a few minutes."));
    if (this.remote) return root.child(this.message(t, "Stages are only kept for repositories on this computer."));
    if (!this.repo) return root.child(this.message(t, this.followed ? "This folder isn't in a Git repository." : "Focus a terminal to see its repository's stages."));
    if (!this.index) {
      if (this.busy()) return root;
      return root.child(
        v_flex()
          .p(8)
          .gap(8)
          .items_start()
          .child(this.message(t, "No stage index for this repository yet. An agent can read its progress documents and write one.").p(0))
          .child(this.textButton(t, "stages-generate", "Generate", (cx) => this.generate(cx, false))),
      );
    }
    const stale = this.stale;
    if (stale && !this.busy()) {
      const why = stale.unknown
        ? "The commit this index was made at is gone, so it can't be brought up to date."
        : stale.missing.length
          ? `${stale.missing.join(", ")} ${stale.missing.length > 1 ? "are" : "is"} no longer in the repository.`
          : `Since this index was made: ${[
              stale.commits ? `${stale.commits} new commit${stale.commits > 1 ? "s" : ""} to the documents` : null,
              stale.changed.length ? `${stale.changed.length} untracked file${stale.changed.length > 1 ? "s" : ""} changed` : null,
            ]
              .filter(Boolean)
              .join(", ")}.`;
      const canUpdate = !stale.unknown && !stale.missing.length;
      root.child(
        h_flex()
          .flex_none()
          .px(14)
          .py(8)
          .gap(8)
          .items_center()
          .border_b(1)
          .border_color(t.border)
          .child(
            div()
              .id("stages-why")
              .flex_1()
              .min_w(0)
              .text_size(TEXT.small)
              .text_color(t.dim)
              .whitespace_normal()
              .tooltip(this.index.sources.join("\n"))
              .child(why),
          )
          .child(
            canUpdate
              ? this.textButton(t, "stages-update", "Update", (cx) => this.generate(cx, true))
              : this.textButton(t, "stages-remake", "Make again", (cx) => this.generate(cx, false)),
          ),
      );
    }
    const list = v_flex().id("stages-list").flex_1().min_h(0).min_w(0).overflow_y_scrollbar().p(6);
    if (!this.index.stages.length)
      list.child(
        this.message(
          t,
          this.index.sources.length
            ? "The index lists no stages."
            : "No document in this repository records its development stages. To use particular files, name them on the index's first line (pencil), then make it again.",
        ),
      );
    // Done stages fold into one row, and so do those not started yet (open when nothing is in
    // progress), set a little apart. The stages in progress show open: every unfinished step,
    // and of the done ones only the latest that fit the panel; the earlier ones fold into a row.
    const stages = this.index.stages.map((stage, i) => ({ stage, i }));
    const done = stages.filter((s) => s.stage.status === "done");
    const todo = stages.filter((s) => s.stage.status === "todo");
    const doing = stages.filter((s) => s.stage.status === "doing");
    const plan = doing.map(({ stage, i }) => {
      const key = `stage:${stage.code ?? stage.name}`;
      const first = stage.status === "doing";
      const open = stage.steps.length ? this.isOpen(key, first) : null;
      const all = open && this.isOpen(`earlier:${key}`, false);
      return { stage, i, key, first, open, all, hidden: new Set() };
    });
    // What the panel has room for, after everything that always shows.
    let room = (this.size?.height ?? 800) - 2 - 42 - 12 - (stale && !this.busy() ? 52 : 0) - (done.length ? 26 : 0) - (todo.length ? 26 + GROUP_GAP : 0);
    for (const p of plan) {
      room -= this.rowHeight(p.stage, 0);
      if (p.open) for (const step of p.stage.steps) if (step.status !== "done") room -= this.rowHeight(step, 1);
    }
    for (const p of plan) {
      if (!p.open || p.all) continue;
      const finished = p.stage.steps.map((step, j) => ({ step, j })).filter(({ step }) => step.status === "done");
      let shown = 0;
      for (const { step } of [...finished].reverse()) {
        const h = this.rowHeight(step, 1);
        if (shown >= MAX_RECENT || (shown >= MIN_RECENT && h > room - (shown < finished.length - 1 ? 26 : 0))) break;
        room -= h;
        shown += 1;
      }
      for (const { j } of finished.slice(0, finished.length - shown)) p.hidden.add(j);
      if (p.hidden.size) room -= 26;
    }
    if (done.length) {
      const group = { key: "group:done", label: "Done", count: done.length, first: false };
      const open = this.isOpen(group.key, group.first);
      list.child(this.groupRow(t, group, open, 0));
      if (open)
        for (const { stage, i } of done) {
          const key = `stage:${stage.code ?? stage.name}`;
          const shown = stage.steps.length ? this.isOpen(key, false) : null;
          list.child(this.row(t, stage, `stage-${i}`, 0, shown, key, false));
          if (shown) stage.steps.forEach((step, j) => list.child(this.row(t, step, `stage-${i}-${j}`, 1)));
        }
    }
    for (const p of plan) {
      list.child(this.row(t, p.stage, `stage-${p.i}`, 0, p.open, p.key, p.first));
      if (!p.open) continue;
      // Shown whole on request, with the row to fold them again.
      const earlier = { key: `earlier:${p.key}`, label: "Earlier done", first: false };
      const finished = p.stage.steps.filter((step) => step.status === "done").length;
      if (p.all && finished > MIN_RECENT) list.child(this.groupRow(t, { ...earlier, count: finished }, true, 1));
      let folded = false;
      p.stage.steps.forEach((step, j) => {
        if (p.hidden.has(j)) {
          if (!folded) list.child(this.groupRow(t, { ...earlier, count: p.hidden.size }, false, 1));
          folded = true;
          return;
        }
        list.child(this.row(t, step, `stage-${p.i}-${j}`, 1));
      });
    }
    if (todo.length) {
      const group = { key: "group:todo", label: "Not started", count: todo.length, first: !doing.length };
      const open = this.isOpen(group.key, group.first);
      list.child(this.groupRow(t, group, open, 0).when(doing.length > 0, (el) => el.mt(GROUP_GAP)));
      if (open)
        for (const { stage, i } of todo) {
          const key = `stage:${stage.code ?? stage.name}`;
          const shown = stage.steps.length ? this.isOpen(key, false) : null;
          list.child(this.row(t, stage, `stage-${i}`, 0, shown, key, false));
          if (shown) stage.steps.forEach((step, j) => list.child(this.row(t, step, `stage-${i}-${j}`, 1)));
        }
    }
    return root.child(list);
  }
}
