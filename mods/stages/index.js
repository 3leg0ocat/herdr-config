// The stage index, read and written only here: a Markdown list an agent writes and a person
// may correct by hand. The first line names its sources and the commit it was made at.
//
//   <!-- source: docs/progress.md, docs/plan.md @ 1a2b3c4 -->
//   - [x] P01 Name — what it delivered
//     - [~] M2 Name — what it delivered

const HEADER = /^<!--\s*source:\s*(.*?)\s*(?:@\s*([0-9a-f]{7,40}))?\s*-->$/;
const ITEM = /^(\s*)[-*] \[([ xX~])\]\s+(.*)$/;
// A project's code: letters then a digit (P08R, M4a, Q1f).
const CODE = /^[A-Za-z]{1,4}-?\d[\w.-]*$/;
const NOTE = /\s+[—–]\s+/;

const STATUS = { " ": "todo", x: "done", X: "done", "~": "doing" };

function item(match) {
  const [, indent, mark, rest] = match;
  // The sentence follows the last dash, so a name may hold one ("Phase 1 — Foundations").
  const cuts = [...rest.matchAll(new RegExp(NOTE, "g"))];
  const cut = cuts.at(-1);
  const title = cut ? rest.slice(0, cut.index) : rest;
  const note = cut ? [rest.slice(cut.index + cut[0].length)] : [];
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

// The index with a new first line.
export function withHeader(text, sources, commit) {
  const lines = String(text).replace(/\r/g, "").split("\n");
  const at = lines.findIndex((line) => HEADER.test(line.trim()));
  if (at === -1) lines.unshift(headerLine(sources, commit));
  else lines[at] = headerLine(sources, commit);
  return `${lines.join("\n").trimEnd()}\n`;
}

// The index in an agent's answer, from its first line on; throws if there is none.
export function fromAgent(output) {
  const lines = String(output ?? "").replace(/\r/g, "").split("\n").filter((line) => !/^\s*```/.test(line));
  const at = lines.findIndex((line) => HEADER.test(line.trim()));
  if (at === -1) throw new Error("The agent's answer has no source line, so it wasn't saved.");
  const body = lines.slice(at).join("\n").trim();
  const index = parseIndex(body);
  // `<!-- source: none -->`: the project has no document that records stages.
  if (index.sources.length === 1 && index.sources[0].toLowerCase() === "none" && !index.stages.length) return { body: "", sources: [], none: true };
  if (!index.stages.length) throw new Error("The agent's answer lists no stages, so it wasn't saved.");
  if (!index.sources.length) throw new Error("The agent's answer names no source files, so it wasn't saved.");
  return { body, sources: index.sources };
}
