// The stage index: a Markdown list an agent writes and a person may correct by hand.
//
//   <!-- source: docs/progress.md, docs/plan.md @ 1a2b3c4 -->
//   - [x] P01 Name — one plain sentence
//     - [~] M2 Name — one plain sentence
//
// The first line says which files it was made from, and at which commit; the rest is stages
// and their steps. Its format is read and written here and nowhere else.

const HEADER = /^<!--\s*source:\s*(.*?)\s*(?:@\s*([0-9a-f]{7,40}))?\s*-->$/;
const ITEM = /^(\s*)[-*] \[([ xX~])\]\s+(.*)$/;
// A project's own code: letters then a digit, such as P08R, M4a, Q1f, B3c.
const CODE = /^[A-Za-z]{1,4}-?\d[\w.-]*$/;
const NOTE = /\s+[—–]\s+/;

const STATUS = { " ": "todo", x: "done", X: "done", "~": "doing" };

function item(match) {
  const [, indent, mark, rest] = match;
  const [title, ...note] = rest.split(NOTE);
  const [first, ...words] = title.trim().split(/\s+/);
  const coded = CODE.test(first) && words.length > 0;
  return {
    depth: indent.length > 0 ? 1 : 0,
    status: STATUS[mark],
    code: coded ? first : null,
    name: coded ? words.join(" ") : title.trim(),
    note: note.join(" — ").trim() || null,
  };
}

// { sources, commit, stages: [{ status, code, name, note, steps: [...] }] }
export function parseIndex(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  const first = lines.find((line) => line.trim()) ?? "";
  const head = first.trim().match(HEADER);
  const stages = [];
  for (const line of lines) {
    const match = line.match(ITEM);
    if (!match) continue;
    const entry = item(match);
    if (entry.depth === 1 && stages.length) stages.at(-1).steps.push(entry);
    else stages.push({ ...entry, steps: [] });
  }
  return {
    sources: head ? head[1].split(",").map((s) => s.trim()).filter(Boolean) : [],
    commit: head?.[2] ?? null,
    stages,
  };
}

export const headerLine = (sources, commit) => `<!-- source: ${sources.join(", ")}${commit ? ` @ ${commit}` : ""} -->`;

// The same index with another first line: the files renamed, or a new commit after an update.
export function withHeader(text, sources, commit) {
  const lines = String(text).replace(/\r/g, "").split("\n");
  const at = lines.findIndex((line) => HEADER.test(line.trim()));
  if (at === -1) lines.unshift(headerLine(sources, commit));
  else lines[at] = headerLine(sources, commit);
  return `${lines.join("\n").trimEnd()}\n`;
}

// What an agent printed, from its header on, or an error that says what was missing.
export function fromAgent(output) {
  const lines = String(output ?? "").replace(/\r/g, "").split("\n").filter((line) => !/^\s*```/.test(line));
  const at = lines.findIndex((line) => HEADER.test(line.trim()));
  if (at === -1) throw new Error("The agent's answer has no source line, so it wasn't saved.");
  const body = lines.slice(at).join("\n").trim();
  const index = parseIndex(body);
  if (!index.stages.length) throw new Error("The agent's answer lists no stages, so it wasn't saved.");
  if (!index.sources.length) throw new Error("The agent's answer names no source files, so it wasn't saved.");
  return { body, sources: index.sources };
}
