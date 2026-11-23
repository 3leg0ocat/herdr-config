Build a stage index for the project in the current folder: its development stages and the
steps of each, so that someone who meets a code such as "M2" in its documents can tell what
it was and whether it is done. Read only; change nothing.

## Find the documents

Projects record their stages their own way: a progress log, a plan, a roadmap, a status
table, a worklog, one file per milestone; under any name, in any language, sometimes in a
folder Git doesn't track or ignores. Look by file name, by content (words for milestone,
phase or stage, in the project's languages) and in such folders (`git status --short
--ignored`). Files may be very large: never read one whole. List its headings, read only the
parts about stages and steps, and search for a code to see what became of it.

## Write the index

Your final answer is the index alone, with no preamble and no code fence, in this format:

```
<!-- source: path/one.md, path/two.md -->
- [x] CODE Name — what it delivered
  - [~] CODE Name — what it delivered
- [ ] Name — what it delivered
```

- First line: the files used, as paths from the repository's top; a folder may be named
  instead, ending in `/`.
- Two levels: stages, and the steps of each. A step is the largest unit a stage is divided
  into, not the tasks inside it; a stage divided only into tasks gets no steps. Steps may be
  defined in a table, in prose, or only by later log entries (in their headings, or a bold
  label at the start of an item). Codes are often reused across stages: take each step's
  facts from its own stage's part of the documents. A project may keep several plans side by
  side: include each one still in use, not one the documents show was dropped or replaced.
- Status: `[x]` done (finished, accepted, deployed or verified, even after rework), `[~]` in
  progress (started, or waiting for a review, deployment or confirmation), `[ ]` not
  started. Go by the newest entries. A done stage's steps are done unless the documents say
  otherwise.
- CODE exactly as the project writes it, and none if it has none. Name: the project's own
  short name, without " — ".
- After the dash, one sentence in the documents' language, 15–30 words (or 25–50 characters
  in a language written without spaces): what it delivered or settled, concretely (which
  feature, for what, with what rule or result), in the written register of a status report.
  Use the project's domain terms, not code identifiers (file, function or table names,
  commit numbers). Say what the name and the status don't. For a stage not started, say
  what the plan says it will deliver. If the documents don't make it clear, leave the
  sentence out rather than guess.
- Leave out decisions, review findings, acceptance criteria, tests and dated notes, even
  when they have codes.
- If no document records development stages (a changelog, design notes or an issue list
  doesn't), print only `<!-- source: none -->`.

## Before answering

For each stage, search its part of the documents for codes built like those of its steps
(the same letters with other numbers or suffixes), and add any step you missed. Check the
status of the latest steps against the newest entries.
