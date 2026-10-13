# ChessBench — Architecture

<!-- ARCHITECTURE_TYPE: 3-TIER -->

Retroactive architecture documentation of the implemented system.

## Document Index

**Quick Navigation:**
- Section 1: Executive Summary
- Section 2: System Overview
- Section 3: Architecture Principles
- Section 4: Architecture Layers
- Section 5: Component Details
- Section 6: Data Flow Patterns
- Section 7: Integration Points
- Section 8: Technology Stack
- Section 9: Security Architecture
- Section 10: Scalability & Performance
- Section 11: Operational Considerations
- Section 12: Architecture Decision Records (ADRs)

**Index Last Updated:** 2026-10-13

## 1. Executive Summary

ChessBench compares AI agents on forced-checkmate puzzles. A TypeScript engine (chess.js) loads FEN mate-in-N challenges, enforces legality, auto-replies for the defender with a fixed deterministic policy, and records every run. Humans play through a React + Chessground board; agents run headless through one provider-agnostic interface (JEV, Laya, Nimble, Tev).

**Key characteristics:**
- Single-process Bun application: HTTP server + UI + engine + agent adapters in one repo.
- Deterministic defender ⇒ reproducible runs, exact replay.
- Corpus is quota-balanced, offline-verified Lichess puzzles (CC0), with frozen provenance.
- Test tiers: unit, contract, integration, boundary (engine isolation).

## 2. System Overview

### 2.1 Problem
Provider-specific APIs, non-reproducible runs, and unrecorded results make agent comparison ad hoc.

### 2.2 Solution
Three-tier local application: React UI → Bun HTTP server and application services → engine, challenge library, provider endpoints, and browser storage.

### 2.3 Primary use cases
- Operator runs a suite (UI or CLI), watches playback, compares scores.
- Human solves puzzles interactively.
- Curator imports/verifies the corpus offline.

Success criteria: runs reproducible from identical states; every ply recorded; reports portable JSON; no secret ever in a report.

## 3. Architecture Principles

1. **Engine is the sole authority.** Agents return raw UCI; the engine validates everything. Implementation: `Agent.requestMove` MUST NOT validate legality; `EngineRun.applySolverMove` rejects illegal/malformed moves and fails the run. Trade-off: agents cannot short-circuit validation.
2. **Determinism over strength.** Fixed lexicographic defender, deterministic choice trimming, sorted challenge execution. Trade-off: weak defense — benchmark success is not proof of a forced strategy.
3. **Provider-agnostic core.** One `Agent` contract; providers differ only by registry flags. Trade-off: lowest common denominator — provider specifics surface as flags (`criteriaAsDict`), not interfaces.
4. **Curation is offline.** Mate proofs and solutions live in curation, never in the runtime engine or agent prompts (beyond the candidate list). Trade-off: corpus requires a verification step on change.
5. **Observability of every attempt.** Rejected moves, per-turn Q&A, timing recorded per ply. Trade-off: larger reports.
6. **Secrets stay in env.** API keys and endpoints read from env vars only; error details scrubbed. Trade-off: no config files for credentials.
7. **Simplicity.** Single process, in-memory job store, browser-local persistence; no database. Trade-off: no multi-process durability (accepted for a benchmarking tool).

## 4. Architecture Layers

### Tier 1: Presentation
`src/ui/` — React SPA served by Bun (`index.html`, `main.tsx`, `App.tsx`).
- `AppShell`, `ChallengeSelector`, `Board` (Chessground), `PromotionPicker`, `MoveHistory`, `StatusBar`, `TraceView` — human play.
- `BenchmarkView` (Set up / Watch / Results), `LiveBenchmark`, `Results`, `ReplayViewer` — benchmarking.
- `benchmark-playback.ts` derives board frames from run records; `benchmark-storage.ts` manages local-storage history.

### Tier 2: Application
- HTTP server (`src/ui/server.ts`): routes `/`, `/api/challenges`, `/api/challenges/:id`, `/api/agents`, `POST /api/benchmarks`, `GET /api/benchmarks/:id`; `BenchmarkJobStore` for job lifecycle.
- Run orchestration: `src/agents/runner.ts` (one run: state building, timeout race, publication), `src/benchmark/runner.ts` (suite: sequential challenge × agent), `src/benchmark/scoring.ts`.
- CLI: `src/cli/run.ts`, `src/cli/bench.ts`, `src/cli/import-challenges.ts`.
- Agent adapters: `src/agents/registry.ts` + `src/agents/shared/http-agent.ts` (+ thin per-provider files).

### Tier 3: Data
- Domain types owned by the engine (`src/engine/types.ts`) — every other layer depends on them, never the reverse.
- Challenge library: one JSON per puzzle under `challenges/`, plus frozen provenance (`provenance/lichess-source.json`, `provenance/mate-proofs.json`).
- chess.js game state inside `EngineRun` (authoritative position).
- Browser localStorage (`chessbench.benchmarks.v1`) for saved benchmarks.
- External provider endpoints (HTTPS).

## 5. Component Details

### 5.1 Engine — `src/engine/`
- `run.ts` `EngineRun`: state machine per run. `applySolverMove(uci, reasoning?)` validates UCI pattern, applies via chess.js, records the ply (with optional reasoning carriage), checks terminal states (checkmate within budget ⇒ solved; stalemate/insufficient material/threefold/solver mated ⇒ dead_position; over budget ⇒ budget_exhausted), then applies the defender reply. `abort(reason, detail)` for timeout/agent errors without recording a move. `snapshot()` for observation; `toRunRecord()` for the immutable record.
- `defender.ts`: `DefenderPolicy` interface, `LexicographicDefender` (v1).
- `validation.ts`: structural challenge validation (`ChallengeLoadError` names file + field + reason).
- `types.ts`: `Challenge`, `Move`, `ChallengeRun`, `SuiteResult`, `PerAgentScore`, `FailReason`, `RunStatus`.
- `moves.ts`: legal UCI enumeration.

### 5.2 Challenges — `src/challenges/`
- `library.ts`: `loadLibrary` (per-file validation, collects errors), `getChallenge`, `listChallenges`.
- `mate-verifier.ts`: `verifyMate` (memoized exhaustive search, smaller depths first, node-limited), `MateProof` tree, `solutionMoves` (line against the deterministic defender), `validateMateProof`. Curation only — never called at runtime.

### 5.3 Agents — `src/agents/`
- `protocol/types.ts`: `Agent`, `ChallengeState`, `AgentMove`, `Availability`, `Provider`.
- `protocol/reasoning.ts`: request building (FEN, ASCII board, move descriptions, `best_move` question), `selectChoices` (deterministic trim, proven move kept), `parseStructuredAnswer`.
- `shared/http-agent.ts`: `HttpProviderAgent` abstract base — availability check from env, request build, criteria shape (array vs dict) via `criteriaAsDict`, answer parsing, timeout plumbing.
- `registry.ts`: `PROVIDER_REGISTRY` (env names, default model, `requireApiKey`, `criteriaAsDict`), `createAgent` — the single place to add a provider.
- `agent-adapters/`: thin subclasses (`jev.ts`, `laya.ts`, `nimble.ts`, `tev1.ts`) overriding only flags.
- `runner.ts`: `runAgentChallenge` — per-turn `ChallengeState`, `Promise.race` against `timeoutMs`, provider throw ⇒ `agent_error`, silence ⇒ `timeout`, publishes snapshots via `onUpdate`.

### 5.4 Benchmark — `src/benchmark/`
- `runner.ts` `runSuite`: sorted challenges × agents, sequential, progress callbacks, optional `choiceLimit`.
- `scoring.ts` `scoreAgents`: per-agent solved/total/score, total solver moves, total elapsed ms.

### 5.5 UI server — `src/ui/server.ts` + `benchmark-jobs.ts`
- `startServer(port, challengesDir)` (exported for tests).
- `BenchmarkJobStore`: in-memory map, job statuses `queued → running → done | error`, latest snapshot per started run retained (intermediate plies preserved).

### 5.6 UI client — `src/ui/`
- `BenchmarkView`: filters define run set, agent availability from `/api/agents`, 1 s polling, playback controls (pause/speed/catch-up are browser-only).
- `benchmark-playback.ts`: frames = starting position + every recorded ply + outcome frame per run.
- `benchmark-storage.ts`: versioned local-storage schema with strict runtime validation; throws on unsupported/corrupt data.

### 5.7 CLI — `src/cli/`
- `run.ts`: list/validate/scripted/interactive/agent/replay modes.
- `bench.ts`: suite runner, JSON to stdout or `--out`, `--choice-limit`.
- `import-challenges.ts`: quota-gated corpus import (network or frozen rows), offline verification, solution extraction.

## 6. Data Flow Patterns

**Agent run (headless):**
`loadLibrary → runSuite → runAgentChallenge → [EngineRun.applySolverMove ⇄ provider HTTP request] → ChallengeRun → scoreAgents → SuiteResult → (stdout JSON | job store → polling UI → localStorage)`.

**Per solver turn:** snapshot → `ChallengeState` (FEN, legal moves, budget, optional choiceLimit + correctMove) → `buildReasoningRequest` (+ trim) → HTTP → `parseStructuredAnswer` → UCI → engine validation → defender auto-reply → publish snapshot.

**Human play:** UI board → UCI → same `EngineRun.applySolverMove` path (defender auto-replies).

## 7. Integration Points

| Endpoint | Direction | Auth | Notes |
|---|---|---|---|
| JEV `JEV_ENDPOINT` (default `https://api.typesafe.ai/v1/systemone`) | outbound | `JEV_API_KEY` required | criteria as dict |
| Laya `LAYA_ENDPOINT` | outbound | keyless (optional `LAYA_API_KEY`) | criteria as array |
| Nimble `NIMBLE_ENDPOINT` (e.g. `http://localhost:11434/v1/systemone`) | outbound | keyless | dict; endpoint caps choices (~26) |
| Tev `TEV_ENDPOINT` + `TEV_MODEL` | outbound | keyless | dict |
| HuggingFace datasets-server (Lichess chess-puzzles) | outbound, import only | none | cached in `.cache/lichess-rows/` |

Model ids overridable per provider via `<PROVIDER>_MODEL` or `--model`. Unavailable providers report `{ok: false, reason}` — never crash the suite setup.

## 8. Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Bun (TypeScript) |
| UI | React, Chessground |
| Chess rules | chess.js |
| HTTP | Bun.serve, fetch |
| Testing | Bun test (unit/contract/integration/boundaries) + one Python browser check (`tests/browser/benchmark-history.py`) |
| Data | JSON files, browser localStorage |

## 9. Security Architecture

- **Credential handling:** API keys and endpoints are env-only (`apiKeyEnv`/`endpointEnv` indirection); never in code, files, or logs. `checkAvailability` reports only the missing env var name.
- **Report hygiene:** `ChallengeRun.error` carries human-readable, non-secret detail only.
- **Input validation:** engine validates every UCI at the trust boundary (agents/humans are untrusted input sources); server validates selection payloads (bad-request responses); storage layer re-validates persisted JSON before use.
- **Trust boundary note:** provider responses are untrusted — parse failures become `agent_error`, never exceptions escaping the run loop.

## 10. Scalability & Performance

Designed for single-operator use: sequential runs, in-memory jobs, no concurrency targets. Bottleneck is provider latency, handled via per-request `timeoutMs`. The polling snapshot design (latest state per started run) keeps the UI current without slowing runs. No perf SLAs; correctness and reproducibility dominate.

## 11. Operational Considerations

- Run: `bun run dev` (UI at `:3210`, `PORT` overridable); `bun test` for the full suite.
- Corpus changes must update frozen source rows, proof records, and quota tests together.
- Server restart loses in-flight jobs (UI resumes a saved pending job only while the server lives); saved results survive in localStorage.
- `.env` is gitignored; `.cache/lichess-rows/` caches import downloads.

## 12. Architecture Decision Records (ADRs)

| ADR | Decision | Status | Date | Impact |
|---|---|---|---|---|
| ADR-001 | Fixed deterministic (lexicographic) defender for reproducibility | Accepted | 2026 | High |
| ADR-002 | Provider registry with flag-based `HttpProviderAgent` subclasses | Accepted | 2026 | High |
| ADR-003 | Runtime loads structure only; mate verification offline in curation | Accepted | 2026 | High |
| ADR-004 | Deterministic candidate trimming preserving the proven move | Accepted | 2026 | Medium |
| ADR-005 | In-memory job store + browser localStorage persistence | Accepted | 2026 | Medium |
