# ChessBench Vault

This repo is two things: a chess mate-puzzle benchmark application (code) and a
knowledge vault (markdown). Keep them separate — vault files never import code,
code never reads vault state.

## Layout

- `raw/` — unprocessed source material (notes, links, transcripts, dumps). Anything dropped here awaits ingest.
- `wiki/` — durable knowledge, four page types:
  - `wiki/concepts/` — explanations (agent provider behavior, engine/scoring ideas)
  - `wiki/how-tos/` — step-by-step procedures (run a benchmark, add an agent, import puzzles)
  - `wiki/references/` — lookup material (endpoints, env vars, corpus facts, external links)
  - `wiki/decisions/` — dated records of what was chosen and why
- `projects/` — active work, one goal per project, each with its own `CLAUDE.md`
- `output/` — analyses and reports generated from run data
- `index.md` — vault entry points
- `log.md` — one line per significant change, `YYYY-MM-DD — what changed`, newest first

## Agent role: active curator

When material sits in `raw/`, process it into the right wiki folder with links
to related pages. Keep `index.md` and `log.md` current after every vault write.
Wiki pages link liberally to each other; prefer updating an existing page over
creating a near-duplicate.

## Wiki scope

1. Agent providers (JEV, Laya, Nimble, Tev): endpoints, quirks, model ids, failure modes
2. Benchmark methodology: scoring, choice-limit effects, corpus selection, reproducibility
3. Challenge corpus: Lichess sourcing, mate-depth/rating categories, licensing
4. General knowledge from reading — chess, AI, tooling — not strictly project-bound

## Rules

- Vault writes go to the four wiki folders, `projects/`, or `output/` — never scatter notes in `src/`, `tests/`, or `challenges/`.
- Delete or prune stale pages rather than letting the wiki rot; note it in `log.md`.
- Ask before deleting anything with content not captured elsewhere.
- Log is minimal: one line per session's significant vault change, no per-file entries.
- New long-lived work gets a `projects/<name>/CLAUDE.md` with one measurable goal and a date — not a task list in the wiki.
