You are building a stage index for the project in the current folder: a short list of its
development stages and the steps inside each, so that a person who sees a code such as "M2"
or "B3c" can tell what it was and whether it is done. Read only; change nothing.

## Where to look

The project records its stages in its own documents, in its own way: a progress log, a plan,
a roadmap, a status table. Unless you are told which files to use, find them (for example
`git ls-files | grep -iE 'progress|plan|roadmap|status|milestone'`, then the headings of
what you find). They may be very large. Never read a large file whole: list its headings
first (`grep -n '^#'`), then read only the parts that name stages and steps, such as a
status table or a table of milestones, and search for a code when you need to know what
became of it.

## What to write

Print the index as your final answer and nothing else (no preamble, no code fence). Write
no files. The format is fixed:

```
<!-- source: path/one.md, path/two.md -->
- [x] CODE Name — one plain sentence
  - [x] CODE Name — one plain sentence
  - [~] CODE Name — one plain sentence
- [ ] CODE Name — one plain sentence
```

- The first line names the files you used, as paths from the top of the repository.
- Two levels only: stages, and the steps of each stage. A step is the largest unit the
  project splits a stage into (a milestone, say), never the tasks inside it. A stage that
  is only split into a task list (T1, T2, ...) gets no steps. Steps may be defined in a
  table, in prose, or only where a later log entry starts, as a heading or as a bold label
  at the start of a list item (`- **Q1c ...**`); look for all of these. The same code (M1,
  M4) is often reused in many stages: only take a step's facts from the part of the
  documents about its own stage. Keep the project's own order.
- `[x]` done, `[~]` in progress, `[ ]` not started. Take it from the latest entries the
  documents have about it. Done: they say it was finished, accepted, deployed or verified,
  even if it was reworked first. In progress: started, or its work is written but they say
  it still waits for a review, deployment or confirmation. A step whose stage is done is
  done unless they say otherwise.
- CODE is the project's own code, exactly as written (P08R, M4a, Q1f). A stage or step with
  no code gets none: start with the name.
- Name: the project's own short name for it, in the documents' language.
- The sentence: in the documents' language, at most about 30 characters (Chinese) or 15
  words, saying what the project can do or has after it, in plain words a newcomer
  understands. It must tell something the name doesn't: never restate the name in other
  words. No file, function or table names, and no engineering jargon such as contract,
  schema, pure function, migration (契约、形状、纯函数、迁移、落库); say what it is about
  instead. Leave it out (no dash) if the documents don't make it clear; never guess.
- Only stages and their steps. Leave out decisions, review findings, acceptance criteria,
  test items and dated notes, even when they have codes.

## Before you answer

Check your list against the documents once: for each stage, search its part of the
documents for the codes its steps use (by their pattern, such as `M[0-9]` or `Q1[a-z]`,
in tables, prose and headings alike) and add any step you missed. Then check the status of
the last few steps of the stage in progress against the newest entries about them.
