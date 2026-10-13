# ChessBench — Behavioral Specification

Normative contracts of the implemented system. Each section states the rule, the enforcing code, and the verifying tests. "MUST/MUST NOT" language is normative — violations are bugs.

## 1. Engine contract

**E1 — Sole validation authority.** `Agent.requestMove` MUST NOT validate move legality. `EngineRun.applySolverMove` MUST validate every submitted UCI against the current position (`src/engine/run.ts:142`, `tests/boundaries/engine-isolation.test.ts`).

**E2 — Invalid input never throws.** A malformed UCI (not matching `[a-h][1-8][a-h][1-8][qrbn]?`) or illegal move MUST be recorded as a rejected move (reason `malformed_move` / `illegal_move` with detail) and fail the run; no exception escapes (`src/engine/run.ts:151-174`, `tests/unit/engine.test.ts`).

**E3 — Solved condition.** A run is `solved` iff the defender is checkmated with `solverMoveCount <= mateInN` (`src/engine/run.ts:99-106`).

**E4 — Fail reasons.** Terminal failures are exactly: `budget_exhausted` (over budget, or mate delivered over budget), `illegal_move`, `malformed_move`, `stalemate`, `dead_position` (solver mated / insufficient material / threefold / defender has no move), `timeout`, `agent_error`, `agent_unavailable` (`src/engine/types.ts:7`).

**E5 — Deterministic defense.** For identical positions the defender MUST return identical replies (lexicographically smallest legal UCI; `src/engine/defender.ts:14`, `tests/unit/engine.test.ts`).

**E6 — Full recording.** Every applied and rejected ply is recorded with side, source, SAN/UCI, resulting FEN, elapsed ms, and (when supplied) the per-turn reasoning payload; the engine treats reasoning as opaque (`src/engine/run.ts:63`, `tests/unit/trace.test.ts`).

**E7 — Abort semantics.** `abort` applies only to in-progress runs and records no move (`src/engine/run.ts:212`).

## 2. Agent interface contract

**A1 — Shape.** An Agent exposes `id`, `name`, `provider`, `model`, `timeoutMs`, `checkAvailability(): Availability`, `requestMove(state): AgentMove` (`src/agents/protocol/types.ts:36`, `tests/contract/agent.test.ts`).

**A2 — Availability.** Missing required API key or endpoint MUST yield `{ok: false, reason}` naming only the env var — never a value (`src/agents/shared/http-agent.ts:61`). An unavailable agent fails its run with `agent_unavailable` before any move request (`src/agents/runner.ts:28`).

**A3 — Timeout.** Silence past `timeoutMs` MUST end the run with fail reason `timeout`; provider throws end it with `agent_error`. Neither may corrupt the recorded history (`src/agents/runner.ts:51-72`, `tests/integration/agent-run.test.ts`).

**A4 — State given per turn.** `ChallengeState.fen` is always the solver's turn; `history` excludes rejected moves; `correctMove` (proven solution move) is provided when the challenge carries a solution (`src/agents/runner.ts:38-49`).

**A5 — Registry completeness.** CLI, server agent lists, and defaults MUST all derive from `PROVIDER_REGISTRY`; adding a provider requires only a registry record + Provider union entry (`src/agents/registry.ts:29`, `tests/integration/cli-agents.test.ts`).

**A6 — Credential hygiene.** Keys/endpoints come from env vars only; no secret may appear in any report or log (`src/agents/shared/http-agent.ts:17-28`, `.env.example`).

## 3. Reasoning protocol

**R1 — Structured question.** Each turn presents the position (FEN + ASCII board), legal move descriptions, and a `best_move` choice question (`src/agents/protocol/reasoning.ts`, `tests/unit/reasoning.test.ts`).

**R2 — Choice limiting.** When `choiceLimit` is set and legal moves exceed it, the adapter MUST present at most `choiceLimit` candidates, trimmed deterministically (mate/check/capture ranked first), always keeping the legal `correctMove` (`src/agents/protocol/reasoning.ts:68`, `tests/integration/choice-limit.test.ts`). Off the solution line the cap still applies with no guaranteed winner.

**R3 — Criteria shape.** Providers are sent criteria as an array, or as a `{label: description}` dict when the provider's registry record sets `criteriaAsDict` (`src/agents/shared/http-agent.ts:84`).

## 4. Benchmark contract

**B1 — Identical starting states.** Every (challenge × agent) run MUST start from the challenge FEN; runs execute sequentially, challenges in id order (`src/benchmark/runner.ts:22`, `tests/integration/benchmark.test.ts`).

**B2 — Report completeness.** A `SuiteResult` contains every run record plus per-agent scores `{agentId, model, solved, total, score, totalSolverMoves, totalElapsedMs}` (`src/benchmark/scoring.ts`, `tests/integration/benchmark.test.ts`).

**B3 — No timing distortion.** Progress/watch callbacks are observational only; playback MUST NOT delay or alter run execution (`src/agents/runner.ts:11`).

## 5. HTTP API

**S1 — `GET /api/challenges`** returns the list of structurally valid challenges; library load errors are logged server-side, never fatal to the response.

**S2 — `GET /api/challenges/:id`** returns the challenge or `404 {error}`.

**S3 — `GET /api/agents`** returns per-provider offers `{id, provider, model, ...availability}`, including a `reason` on unavailability.

**S4 — `POST /api/benchmarks`** with a selection payload (challenge ids + agent kinds):
- Unparseable JSON or non-string ids ⇒ `400`.
- Unknown challenge id or unregistered agent kind ⇒ `400` naming it.
- Valid ⇒ job created and the suite starts; run snapshots stream into the job.

**S5 — `GET /api/benchmarks/:id`** returns `{id, status, completedRuns, totalRuns, runs, report, error}`:
- Job statuses: `queued → running → done | error`.
- `runs` holds the latest snapshot of every started run, in execution order, including intermediate plies — fast runs MUST NOT be skipped in playback.
- Unknown job ⇒ `404`.
(`src/ui/server.ts:132`, `tests/integration/benchmark-api.test.ts`.)

## 6. Persistence (browser)

**P1 — Envelope.** localStorage key `chessbench.benchmarks.v1`, value `{version: 1, results: SavedBenchmark[], pending: PendingBenchmark | null}` (`src/ui/benchmark-storage.ts:3`).

**P2 — Strict validation.** Loading MUST structurally validate every stored benchmark; corrupt or unsupported data throws and the UI shows the message rather than silently dropping results (`src/ui/benchmark-storage.ts:66`, `tests/unit/benchmark-storage.test.ts`, `tests/browser/benchmark-history.py`).

**P3 — Saved completeness.** Each saved result stores the report plus the challenges used (starting FENs + traces), so replay is independent of the current library.

**P4 — Dedupe.** Re-saving a `suiteId` replaces, not duplicates (`completeBenchmark`).

## 7. Corpus contract

**C1 — Structural loading only.** The runtime loader checks structure, never forced-mate correctness (`src/challenges/library.ts`, `src/engine/validation.ts`, `tests/integration/library.test.ts`).

**C2 — Offline proofs.** Every curated puzzle MUST carry an exact-depth `MateProof` tree validated by corpus tests; the tree must cover every legal defender reply, and no shorter forced mate may exist (`src/challenges/mate-verifier.ts`, `tests/integration/challenge-corpus.test.ts`, `tests/unit/mate-verifier.test.ts`).

**C3 — No leakage.** Solutions and proofs MUST NOT be sent to agents; only the trimmed candidate list (which may contain the solution move) is visible (`R2`).

**C4 — Provenance.** Challenge ids are `lichess-<PuzzleId>`; source records include URLs, rating, CC0-1.0 license; frozen rows carry a SHA-256 of the row array; corpus changes must update rows, proofs, and quota tests together (`challenges/README.md`, `src/cli/import-challenges.ts`).

**C5 — Import gating.** Network import writes challenge data only after every quota fills; rows below quality thresholds (popularity < 80, plays < 100, rating deviation > 100) are skipped; the importer applies the dataset's setup move before storing the FEN and requires the remaining line to be legal checkmate in `2*depth-1` plies (`src/cli/import-challenges.ts`).

## 8. CLI contract

**X1 — `run.ts`**: `--list`, `--validate` (exit 1 on any library error), `--challenge <id>` (scripted `--moves`, interactive prompt, or `--agent <provider> [--model]` printing the run JSON), `--replay <file>`.

**X2 — `bench.ts`**: unknown agent or challenge spec MUST fail fast before any run starts; report is JSON to stdout or `--out`; progress on stderr (`src/cli/bench.ts:37`).

## 9. Honest-limitation clauses

**L1** — Benchmark success against the deterministic defender is necessary but not sufficient evidence of a forced mate strategy (weak defense by design).

**L2** — The job store is process-local; no durability across server restarts (saved browser results are the durable artifact).

**L3** — Storage is per-browser and per-origin; clearing site data deletes saved benchmarks.
