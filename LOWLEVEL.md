# ChessBench — Low-Level Design

Module-by-module description of the implemented code. Interfaces and behavior below are taken from source; line references use `file:line`.

## 1. Engine (`src/engine/`)

### 1.1 Types — `types.ts`
- `Color`, `MoveSource = "solver" | "defender"`, `Difficulty = "easy" | "medium" | "hard"`.
- `FailReason`: `budget_exhausted | illegal_move | malformed_move | timeout | stalemate | dead_position | agent_error | agent_unavailable`.
- `RunStatus`: `in_progress | solved | failed`.
- `Challenge`: `id, title, description?, fen, sideToMove, mateInN, difficulty, tags[], source?{provider:"lichess", puzzleId, url, gameUrl, rating, license:"CC0-1.0"}, solution?: string[]` (proven solver UCIs, one per solver turn, length === mateInN; curation data used to keep the winning move among limited candidates).
- `Move`: `ply, side, source, uci, san, resultingFen, atMs, rejected?{reason, detail}, reasoning?{question: unknown, answer: unknown}` (opaque carriage — engine never inspects).
- `ChallengeRun`: `id, challengeId, agentId, model?, startedAt, endedAt?, status, failReason, solverMoveCount, moves[], elapsedMs?, error?` (error is non-secret).
- `PerAgentScore`: `agentId, model, solved, total, score, totalSolverMoves, totalElapsedMs`.
- `SuiteResult`: `suiteId, ranAt, challengeIds[], agentIds[], runs[], scores[]`.
- `ChallengeLoadError(file, field, reason)` — thrown for unusable challenge definitions.

### 1.2 Run — `run.ts`
`EngineRun(challenge, solverId, defender = new LexicographicDefender())`.

State: chess.js `game` from `challenge.fen`, `moves[]`, `status`, `failReason`, `errorDetail`, `solverMoveCount`, start timestamps.

- `applySolverMove(uci, reasoning?)` — `run.ts:142`:
  1. Terminal already ⇒ return result unchanged.
  2. Not matching `UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/` ⇒ record rejected move `{reason: "malformed_move"}`, fail.
  3. chess.js rejects the move ⇒ record `{reason: "illegal_move"}`, fail.
  4. Apply; increment `solverMoveCount`; record move with reasoning.
  5. `evaluateTerminal()` (`run.ts:98`): defender checkmated and `solverMoveCount <= mateInN` ⇒ **solved**; solver checkmated, stalemate, insufficient material, threefold ⇒ `dead_position`/`stalemate`; checkmate over budget ⇒ `budget_exhausted`.
  6. Over budget without mate ⇒ `budget_exhausted`.
  7. Defender reply via `defender.chooseMove(fen)`; `null` ⇒ `dead_position`; else apply and record, re-evaluate terminal.
- `abort(reason, detail)` — `run.ts:212`: fails in-progress run for `timeout | agent_error | agent_unavailable` without recording a move.
- `snapshot()`: `{status, failReason, fen, moves[], solverMoveCount}` (defensive copy).
- `toRunRecord(runId, model?)`: immutable `ChallengeRun` with `endedAt`, `elapsedMs`.

Invariant: invalid input never throws; everything is recorded.

### 1.3 Defender — `defender.ts`
`DefenderPolicy.chooseMove(fen): string | null`. `LexicographicDefender`: sorts all legal UCIs (`from+to+promotion`) and returns the first; `null` when no legal moves.

### 1.4 Validation — `validation.ts`
`validateChallenge` — structural checks (unique nonempty id, legal non-terminal FEN, matching `sideToMove`, positive integer `mateInN`, difficulty enum, tags array, provenance shape). Returns the typed challenge or throws `ChallengeLoadError`.

### 1.5 Moves — `moves.ts`
`legalUciMoves(fen)`: legal UCI strings for the side to move.

## 2. Challenges (`src/challenges/`)

### 2.1 Library — `library.ts`
- `loadLibrary(dir)`: reads one JSON per file directly under the dir; per-file `validateChallenge`; returns `{challenges, errors}` — bad files never block the rest. Provenance subdirectory files are not loaded as challenges.
- `getChallenge(challenges, id)`: lookup, throws with a clear message on unknown id.
- `listChallenges(challenges)`: ordered summary list.

### 2.2 Mate verification — `mate-verifier.ts` (curation only)
- `MateProof {move: string, replies: Record<string, MateProof>}` — a full winning strategy tree; empty `replies` = checkmate.
- `verifyMate(fen, maxDepth, nodeLimit=25000)` (`mate-verifier.ts:12`): memoized DFS (`key = fen|remaining`), move ordering mate > check > lexicographic; for each candidate solver move, requires a continuation against **every** legal defender reply; searches depth 1..maxDepth ascending; throws on node limit. Returns `{depth, proof, nodes}` or null.
- `solutionMoves(fen, proof, defender)` (`mate-verifier.ts:67`): walks the proof along the given (deterministic) defender's replies → one solver UCI per turn.
- `validateMateProof(fen, proof, remaining)` (`mate-verifier.ts:87`): cheap re-check of the stored tree — move legal, checkmate at leaves, every reply covered, counts match.

## 3. Agents (`src/agents/`)

### 3.1 Contract — `protocol/types.ts`
- `Provider = "jev" | "laya" | "nimble" | "tev" | "mock"`.
- `ChallengeState`: `challengeId, fen (always solver's turn), sideToMove, mateInN, solverMovesUsed, movesRemaining, history[] (applied UCIs), legalMoves[], choiceLimit?, correctMove?` (proven winner for this turn).
- `AgentMove`: `{uci, reasoning?}`.
- `Availability`: `{ok: true} | {ok: false, reason}`.
- `Agent`: `id, name, provider, model, timeoutMs`, `checkAvailability()`, `requestMove(state)` — MUST NOT validate legality.

### 3.2 Reasoning protocol — `protocol/reasoning.ts`
- `renderAsciiBoard(fen)`: text board for the prompt.
- `legalMovesWithDescriptions(fen)`: candidate moves with SAN descriptions.
- `buildReasoningRequest(state, model)`: structured request; `questions.best_move` is a `ChoiceQuestion` (label, question text, criteria).
- `selectChoices(moves, limit, correctMove)` (`reasoning.ts:68`): deterministic trim to `limit` candidates (mate/check/capture ranked first); `correctMove` always kept when legal.
- `parseStructuredAnswer` (`reasoning.ts:120`): extracts the chosen move from the provider's structured reply (e.g. `answers.best_move.choice`).
- `BEST_MOVE_QUESTION = "best_move"`; `bestMoveInstructions(movesRemaining)` varies wording for the final move.

### 3.3 HTTP base — `shared/http-agent.ts`
`HttpProviderAgent` (abstract) implements `Agent`:
- Options: `id, name?, provider, model, apiKeyEnv, endpointEnv, timeoutMs?, fetchImpl?` (injectable for tests).
- `checkAvailability()`: `requireApiKey && !env[apiKeyEnv]` ⇒ missing-key reason; no endpoint ⇒ missing-endpoint reason.
- `buildRequestBody(state)`: `buildReasoningRequest` verbatim; when `state.choiceLimit` is set and legal moves exceed it, replaces `criteria` with `selectChoices(...)` SAN list; subclass flag `criteriaAsDict` sends criteria as `{label: description}` instead of an array.
- `requestMove(state)`: POST to endpoint (auth header when key present), parse via `parseStructuredAnswer` with `RequestContext` (question + moves), map failures to thrown errors (surfaced as `agent_error` upstream).

### 3.4 Registry — `registry.ts`
`PROVIDER_REGISTRY` per provider: `apiKeyEnv, endpointEnv, modelEnv, defaultModel, requireApiKey?, criteriaAsDict?`.

| key | default model | key required | criteria |
|---|---|---|---|
| jev | `jev-latest` | yes | dict |
| laya | `laya-latest` | no | array |
| nimble | `nimble` | no | dict |
| tev | `tev1:0.8b` | no | dict |

`defaultModel(kind)` honors `<PROVIDER>_MODEL`. `createAgent(kind, options)` builds an inline `RegistryAgent extends HttpProviderAgent` applying the two flags — no per-provider file needed. Adapters in `agent-adapters/` exist only for extra overrides.

### 3.5 Runner — `runner.ts`
`runAgentChallenge({challenge, agent, runId, onUpdate?, choiceLimit?})` (`runner.ts:21`):
1. Publish initial snapshot.
2. `checkAvailability()` failure ⇒ `abort("agent_unavailable", reason)`.
3. Loop while `in_progress`: build `ChallengeState` from snapshot (history excludes rejected moves; `correctMove = solution[solverMoveCount]` when present); `Promise.race(agent.requestMove(state), timeout)`; timeout message ⇒ `abort("timeout")`, other errors ⇒ `abort("agent_error")`; on success `applySolverMove(uci, reasoning)`; publish after each turn.
4. Return `toRunRecord`.

## 4. Benchmark (`src/benchmark/`)

- `runner.ts` `runSuite({suiteId, challenges, agents, onProgress?, onRunUpdate?, choiceLimit?})` (`runner.ts:22`): challenges sorted by id, sequential (challenge-major, agent-minor) so all agents see identical states; runId = `${suiteId}-${challenge.id}-${agent.id}`; assembles `SuiteResult` with `scoreAgents(runs, models)`.
- `scoring.ts` `scoreAgents(runs, models)`: per-agent aggregates (solved count, total, score ratio, total solver moves, total elapsed ms).

## 5. UI server (`src/ui/`)

### 5.1 `server.ts`
`startServer(port, challengesDir)` — `Bun.serve` routes (`server.ts:132`):
- `GET /` — SPA index.
- `GET /api/challenges` — library list (load errors logged, not fatal).
- `GET /api/challenges/:id` — one challenge or 404 JSON.
- `GET /api/agents` — availability probe per provider (`agentOffers`): id, provider, model, availability + reason.
- `POST /api/benchmarks` — `handlePostBenchmarks`: parses selection JSON (bad JSON/shape ⇒ 400), validates every challengeId (unknown ⇒ 400 with the id), creates a job, kicks off `runSuite` with callbacks wired to the job store, returns the job.
- `GET /api/benchmarks/:id` — job status payload: `{id, status, completedRuns, totalRuns, runs, report, error}`; unknown job ⇒ 404.

### 5.2 `benchmark-jobs.ts`
`BenchmarkJobStore` — in-memory `Map`, monotonic counter ids `job-<ts>-<n>`. `JobStatus: queued | running | done | error`. `updateRun` upserts the latest snapshot per run id (keeps intermediate plies for playback); `complete` sets `report` and copies `report.runs`; `fail` sets `error`. No persistence — single process only.

### 5.3 Client storage — `benchmark-storage.ts`
- Key `chessbench.benchmarks.v1`; envelope `{version: 1, results[], pending}`.
- `SavedBenchmark {report: SuiteResult, challenges[]}` — challenges stored so replay is library-independent.
- Strict structural validators (`isChallenge`, `isRun`, `isSaved`) — corrupt/unsupported data **throws** (UI surfaces the message instead of silently dropping data).
- `loadBenchmarkHistory` / `saveBenchmarkHistory` / `completeBenchmark` (dedupe by `suiteId`, clears pending) / `deleteBenchmark`.

### 5.4 Playback — `benchmark-playback.ts`
`benchmarkFrames(runs, challenges)` (`benchmark-playback.ts:13`): per run — frame 0 = challenge FEN, one frame per recorded ply (including rejected attempts), plus an outcome frame for terminal runs. `{run, challenge, runIndex, ply, outcome, fen}`.

### 5.5 Components — `src/ui/components/`
- `App` — tab navigation (Play / Benchmark); keeps an active human puzzle alive across tab switches.
- `Board` (Chessground) + `PromotionPicker`, `MoveHistory`, `StatusBar`, `TraceView` (per-turn Q&A display).
- `BenchmarkView` — Set up (agent offers, depth/difficulty filters define the candidate set, per-challenge uncheck, "limit move choices" ⇒ `CHOICE_LIMIT = 20`), Watch (`LiveBenchmark`, `POLL_MS = 1000`, pause/speed/catch-up are browser-only), Results (`Results`, `ReplayViewer`), saved-results list from storage.

## 6. CLI (`src/cli/`)

### 6.1 `run.ts`
Modes: `--list` (tab-separated id/title/difficulty/tags), `--validate` (exit 1 on library errors), `--challenge <id>` with `--moves u1,u2,...` (scripted), interactive prompt, or `--agent <provider> [--model <id>]` (headless via `runAgentChallenge`, prints the run JSON), `--replay <file>` (re-runs a stored report's moves).

### 6.2 `bench.ts`
`--challenges <ids>`, `--agents <specs>`, `--suite <dir>`, `--suite-id`, `--model`, `--choice-limit <n>`, `--out <file>`. Defaults: all providers, first 5 challenges by id. Validates ids up front (typo fails fast). Progress on stderr; JSON report on stdout or `--out`.

### 6.3 `import-challenges.ts`
- `QUOTAS` matrix (depth × difficulty).
- `difficultyFor(rating)`: `<1200 easy, <1800 medium, else hard`.
- Row filter: `Popularity >= 80`, `NbPlays >= 100`, `RatingDeviation <= 100`, theme `mateIn1|2|3`, quota open, no duplicate position.
- FEN conversion: dataset FEN precedes the opponent setup move — importer applies the first UCI move, then requires the remaining line to be legal, end in checkmate, with `2*depth-1` plies.
- `verifyMate(fen, depth, 3000)` must confirm exact depth; `solutionMoves` extracts the line against `LexicographicDefender`.
- Title from source themes; id `lichess-<PuzzleId>`.
- `--source challenges/provenance/lichess-source.json` ⇒ offline rebuild from frozen rows; otherwise fetches HuggingFace datasets-server pages (`.cache/lichess-rows/`, 8 retries, 60 s timeout), writing only after all quotas fill.
- Writes challenge JSONs, updates provenance records.

## 7. Tests (`tests/`)

| Tier | Files | Cover |
|---|---|---|
| unit | engine, reasoning, trace, scaffold, pieces-assets, benchmark-playback, benchmark-storage, mate-verifier | pure module behavior |
| contract | agent.test.ts | `Agent` interface contract (mock agent) |
| integration | agent-run, reasoning-run, benchmark, benchmark-api, choice-limit, challenge-corpus, library, human-play, cli-agents | full flows incl. HTTP server (ephemeral port via exported `startServer`) |
| boundaries | engine-isolation.test.ts | engine stays independent of provider protocols/UI |
| browser | benchmark-history.py | saved-benchmark flow |

Fixtures: hand-made mate-in-1/2/3 challenges (solution absent), `MockAgent`, solutions map.
