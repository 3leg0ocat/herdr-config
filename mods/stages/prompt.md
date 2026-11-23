You are building a stage index for the project in the current folder: a short list of its
development stages and the steps inside each, so that a person who sees a code such as "M2"
or "B3c" can tell what it was and whether it is done. Read only; change nothing.

## Where to look

The project records its stages in its own documents, in its own way: a progress log, a plan,
a roadmap, a status table, a worklog, one file per milestone; in any language, under any
name. Unless you are told which files to use, find them: by name (`git ls-files | grep -iE
'progress|plan|roadmap|status|milestone|todo|log|进度|计划'`) and by content (`git grep -liE
'milestone|phase|sprint|里程碑|阶段' -- '*.md' '*.txt'`), and in folders Git doesn't track or ignores,
such as a scratch or notes folder (`git status --short --ignored`), then the headings of what
you find. They may be very large. Never read a large file whole: list its headings
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

- The first line names the files you used, as paths from the top of the repository; a
  folder of many such files may be named instead, ending in `/`.
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
- Name: the project's own short name for it, in the documents' language, without " — "
  (write "Phase 1: Foundations").
- The sentence: in the documents' language, about 25–50 characters (Chinese) or 12–25
  words. State concretely what it delivered or settled: which feature, on which object, with
  what rule or result, as a design or status document would put it. Written register: no
  colloquial phrases, filler or second person (not 能…了、跟着变、不出错、弄清、搞定; not
  "now you can", "works fine"). Use the project's own domain terms; leave out code
  identifiers (file, function, table names, migration or commit numbers). It must add
  something the name doesn't: never restate the name in other words. For example, not
  "结案或重开后会话状态跟着变，不出错" but "问答线程不再随结案、合并或提示词版本变化而关闭，可继续追问".
  A stage not started yet takes its sentence from what the plan says it will deliver.
  Leave it out (no dash) if the documents don't make it clear; never guess.
- Only stages and their steps. Leave out decisions, review findings, acceptance criteria,
  test items and dated notes, even when they have codes.
- If no document of the project records its development stages (a changelog of releases,
  design notes or an issue list are not one), print only `<!-- source: none -->`.

## Before you answer

Check your list against the documents once: for each stage, search its part of the
documents for the codes its steps use (by their pattern, such as `M[0-9]` or `Q1[a-z]`,
in tables, prose and headings alike) and add any step you missed. Then check the status of
the last few steps of the stage in progress against the newest entries about them.
