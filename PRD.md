# ChessBench — Product Requirements Document

Retroactive PRD: describes the implemented product as shipped. Every requirement below maps to code in this repository and is marked by status.

## 1. Problem

Comparing AI agents on chess reasoning is ad hoc: each provider has its own API, runs are not reproducible (defender replies vary), and results are not recorded in a comparable form. ChessBench fixes this with a fixed puzzle corpus, a deterministic defender, one provider-agnostic agent interface, and structured run reports.

## 2. Users

- **Benchmark operator** — runs agents over challenge suites, watches and compares results (UI + CLI).
- **Human player** — solves mate-in-N puzzles on the board UI.
- **Corpus curator** — imports, verifies, and maintains the challenge library.

## 3. Scope

In scope: forced-checkmate puzzles (mate in 1–3), four provider agents, headless + UI benchmarking, offline corpus curation. Out of scope: general chess play, non-mate challenges, optimal defender play.

## 4. Feature requirements

### FR-001 Challenge corpus
Sourced Lichess puzzles with mate-depth (1/2/3) and difficulty (easy/medium/hard) categories, quota-balanced. Each challenge JSON carries id, title, FEN, sideToMove, mateInN, difficulty, tags, and provenance (puzzle URL, rating, CC0-1.0 license). **Status: implemented** (`challenges/`, `src/cli/import-challenges.ts`).

### FR-002 Structural runtime loading
The runtime loader validates structure only (legal non-terminal FEN, matching side, positive mateInN, provenance shape) — never forced-mate correctness. Invalid files are reported, not fatal to the rest of the library. **Status: implemented** (`src/challenges/library.ts`, `src/engine/validation.ts`).

### FR-003 Offline mate verification
Curated puzzles are proven forced mates by an offline exhaustive search over all solver moves and every legal defender reply, producing branching proof trees — not just a principal variation. Proofs are frozen in `challenges/provenance/mate-proofs.json` and validated by tests. No proof or solution is exposed to agents or the runtime engine. **Status: implemented** (`src/challenges/mate-verifier.ts`, `tests/integration/challenge-corpus.test.ts`).

### FR-004 Deterministic defender
The defending side auto-replies with a fixed deterministic policy (lexicographically smallest legal UCI). Identical positions always produce identical replies: runs are reproducible and replays are exact. The defender is deliberately not optimal — success against it is not proof of a forced strategy. **Status: implemented** (`src/engine/defender.ts`).

### FR-005 Headless engine runs
One run = solver vs. deterministic defender. The engine enforces legality, applies defender replies, tracks every ply (including rejected attempts with reason), and ends solved/failed with a typed fail reason. Invalid solver input never throws; it is recorded and fails the run. **Status: implemented** (`src/engine/run.ts`).

### FR-006 Provider-agnostic agent interface
Agents implement `checkAvailability()` + `requestMove(state)`. Agents never validate legality; the engine is the sole authority. Adding a provider = one registry record (env var names, default model, two behavior flags). **Status: implemented** (`src/agents/protocol/types.ts`, `src/agents/registry.ts`).

### FR-007 Four providers
JEV (remote, API key required), Laya (local keyless), Nimble (local Ollama-fronted), Tev (local Ollama-fronted). Credentials and endpoints come from environment variables only — never files or code; model ids are runtime-overridable. **Status: implemented** (`src/agents/registry.ts`, `src/agents/shared/http-agent.ts`).

### FR-008 Structured reasoning protocol
Each solver turn is a structured Q&A: position (FEN + ASCII board), move descriptions, and a `best_move` choice question. Per-turn Q&A is recorded on the applied move for trace viewing; the engine treats it as opaque. **Status: implemented** (`src/agents/protocol/reasoning.ts`).

### FR-009 Choice limiting
Optional cap on candidate moves offered per turn (UI option: 20). Trimming is deterministic (mate/check/capture moves first); the proven solution move is kept whenever it is legal. Enables bounded-choice heads (e.g. Nimble's 26-option limit). **Status: implemented** (`src/agents/protocol/reasoning.ts` `selectChoices`, `state.choiceLimit`).

### FR-010 Benchmark suites
Every (challenge × agent) pair runs sequentially from identical starting states into one report: runs + per-agent scores (solved/total/score, solver moves, elapsed ms). **Status: implemented** (`src/benchmark/runner.ts`, `src/benchmark/scoring.ts`).

### FR-011 Human puzzle play
React + Chessground board to play through puzzles with promotion picker, move history, status bar, and trace view. Navigation stays available during play. **Status: implemented** (`src/ui/`).

### FR-012 Benchmark UI: Set up / Watch / Results
Set up: choose agents and challenges (depth/difficulty filters define the run set; individual challenges can be unchecked). Watch: follows actual agent moves on the board, auto-advances; Pause/Speed/Catch up affect browser playback only, never benchmark timing. Results: scores plus per-run replay. **Status: implemented** (`src/ui/server.ts`, `src/ui/components/`).

### FR-013 Live progress via polling
The server publishes the latest snapshot of every started run, retaining intermediate plies, so fast runs are not skipped during viewing. The UI polls the job endpoint each second. **Status: implemented** (`src/ui/benchmark-jobs.ts` `updateRun`).

### FR-014 Saved benchmarks
Completed UI benchmarks are saved automatically to browser local storage with starting positions and move traces, so replay does not depend on the current library. Pending jobs survive refresh (if the server has not restarted); saved results survive restarts. Storage failures warn rather than silently claiming success. **Status: implemented** (`src/ui/benchmark-storage.ts`).

### FR-015 CLI
`run.ts` (list, validate, scripted/interactive/human play, agent runs, replay a report JSON) and `bench.ts` (multi-agent suites, JSON report, optional `--out`, `--choice-limit`). **Status: implemented** (`src/cli/`).

### FR-016 Reproducible corpus import
Import from the public Lichess dataset (network operation, cached pages, quota-gated writes) or rebuild offline from frozen source rows. Selection policy: popularity ≥ 80, plays ≥ 100, rating deviation ≤ 100, quota matrix per depth × difficulty. **Status: implemented** (`src/cli/import-challenges.ts`, `challenges/provenance/`).

## 5. Non-functional requirements

- **Reproducibility** — deterministic defender + structural loading + frozen provenance.
- **Secret hygiene** — credentials via env only; never logged or written into reports (error details scrubbed to non-secret messages).
- **Test coverage** — unit, contract (agent interface), integration, and boundary (engine isolation) suites; `bun test` runs all.

## 6. Known limitations

- Defender is weak: an agent can "solve" via a non-forced line the defender fails to refute.
- Job store is in-memory, single server process: refresh mid-run only resumes if the server process persists.
- Benchmark storage is per-browser; clearing site data removes saved results.
- Corpus importer never deletes obsolete puzzle files; corpus changes require a clean library.
