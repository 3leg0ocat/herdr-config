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
const BUSY = "stages.busy";
const FOLLOW_MS = 500;
const CHECK_MS = 30000;
const AGENT_MS = 600000;
const TEXT = { badge: 10, caption: 11, small: 12, body: 13 };
const INDENT = 14;

const Icon = (name, size = 14) => svg(`mods/stages/icons/${name}.svg`).size(size).flex_none();

async function git(cwd, args) {
  const r = await exec("git", ["--no-optional-locks", "-c", "core.quotepath=off", ...args], { cwd });
  if (r.code !== 0) throw new Error(r.stderr.trim() || `git ${args[0]} failed.`);
  return r.stdout;
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
        this.stale = this.index?.commit ? await this.staleness(repo) : null;
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

  // Commits to the documents since the index was made. A renamed document is followed (the
  // index's first line is rewritten); a deleted one is reported.
  async staleness(repo) {
    const { sources, commit } = this.index;
    const known = await exec("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: repo.top });
    if (known.code !== 0) return { unknown: true };
    const changes = (await git(repo.top, ["diff", "--name-status", "-z", "-M", "--diff-filter=RD", commit, "HEAD"])).split("\0");
    const renamed = new Map();
    const deleted = new Set();
    for (let i = 0; i < changes.length; ) {
      const kind = changes[i];
      if (kind?.startsWith("R")) {
        renamed.set(changes[i + 1], changes[i + 2]);
        i += 3;
      } else if (kind === "D") {
        deleted.add(changes[i + 1]);
        i += 2;
      } else i += 1;
    }
    const sources2 = sources.map((s) => renamed.get(s) ?? s);
    if (sources.some((s) => renamed.has(s))) {
      const text = withHeader(this.text, sources2, commit);
      await writeTextFile(repo.file, text, this.text);
      this.text = text;
      this.index = parseIndex(text);
    }
    const missing = sources2.filter((s) => deleted.has(s));
    const live = sources2.filter((s) => !deleted.has(s));
    const commits = live.length ? Number((await git(repo.top, ["rev-list", "--count", `${commit}..HEAD`, "--", ...live])).trim()) : 0;
    return commits || missing.length ? { commits, missing } : null;
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
          request +=
            `\n## This time: bring an index up to date\n\nThe index below was made at commit ${old.commit}. ` +
            `Read what changed since (\`git log --oneline ${old.commit}..HEAD -- ${files}\`, then ` +
            `\`git diff ${old.commit} HEAD -- ${files}\`), not the whole files, and print the whole index ` +
            "again with those changes applied: add new stages and steps, and change the statuses and " +
            "sentences they affect. Keep every other line exactly as it is: a person may have corrected it.\n\n" +
            `${text.trim()}\n`;
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
        // Only files this repository tracks can be a source; the agent's order is kept.
        const listed = new Set((await git(repo.top, ["ls-files", "--", ...out.sources])).split("\n").filter(Boolean));
        const tracked = out.sources.filter((s) => listed.has(s));
        if (!tracked.length) throw new Error("The agent named no file of this repository as its source, so its answer wasn't saved.");
        const made = withHeader(out.body, tracked, head);
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

  isOpen(stage) {
    const key = stage.code ?? stage.name;
    const open = this.opened.get(this.repo.top);
    return open ? open.has(key) : stage.status === "doing";
  }

  toggle(stage, cx) {
    const key = stage.code ?? stage.name;
    let open = this.opened.get(this.repo.top);
    if (!open) {
      open = new Set(this.index.stages.filter((s) => s.status === "doing").map((s) => s.code ?? s.name));
      this.opened.set(this.repo.top, open);
    }
    if (!open.delete(key)) open.add(key);
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

  row(t, entry, id, depth, open = null) {
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
          .on_click((_e, cx) => this.toggle(entry, cx)),
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
          : `The documents have ${stale.commits} new commit${stale.commits > 1 ? "s" : ""} since this index was made.`;
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
    this.index.stages.forEach((stage, i) => {
      const open = stage.steps.length ? this.isOpen(stage) : null;
      list.child(this.row(t, stage, `stage-${i}`, 0, open));
      if (open) stage.steps.forEach((step, j) => list.child(this.row(t, step, `stage-${i}-${j}`, 1)));
    });
    if (!this.index.stages.length) list.child(this.message(t, "The index lists no stages."));
    return root.child(list);
  }
}
