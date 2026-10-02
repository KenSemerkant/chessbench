# ChessBench — Mate Challenges

Compare AI agents on forced-checkmate puzzles. A headless TypeScript engine (built on `chess.js`) loads FEN mate-in-N challenges, enforces legality, auto-replies for the defender with a fixed deterministic policy, and records every run. Humans play through a React + Chessground board; agents run headless through one provider-agnostic interface (JEV, Laya, Nimble, Tev).

## Run it

```sh
bun install
bun test            # full suite: unit, contract, integration, boundaries
bun run dev         # UI at http://localhost:3210 (PORT= to override)
```

## Challenge corpus

The application uses sourced Lichess puzzles with independent mate-depth and puzzle-rating difficulty categories. Filter by mate-in-1/2/3 and easy/medium/hard in Play or benchmark setup; in benchmark setup the filters directly define the run set (all matching challenges are selected, and you can uncheck individual ones to narrow the subset). Source links, licensing, selection quotas, offline proofs, and reproducible import commands are documented in [challenges/README.md](challenges/README.md). Original unsourced seed puzzles remain test fixtures only.

## Chess studio

Navigation stays available during puzzles, live viewing, and replay. Switch between Play and Benchmark without losing an active human puzzle.

Benchmark has separate **Set up**, **Watch**, and **Results** views. Choose agents and challenges, then run: Watch follows actual agent moves on the board and advances automatically through each agent/challenge run. **Pause viewing**, **Speed**, and **Catch up** control browser playback only; agents continue running and benchmark timing is unchanged. The server publishes the latest snapshot of every started run through the existing polling API, retaining intermediate plies so fast runs are not skipped.

**Limit move choices to 20** (Set up) caps the candidate moves offered each turn so bounded choice heads — e.g. Nimble's 26-option limit — can answer. Every position larger than the cap is trimmed deterministically (mate/check/capture moves first); the proven solution move is kept whenever it is legal in the current position. Off the solution line the cap still applies (no winning move is guaranteed then), so the server is never sent more candidates than the limit.

Completed suites can also be watched from Results with **Watch playback**. Use **View results** for scores and individual-run replay.

## Saved benchmarks

Completed UI benchmarks are saved automatically in this browser's local storage. The Benchmark tab lists saved results with their date, models, and scores; choose **Open results** to replay or compare runs, or **Delete** to remove a result after confirmation. Starting positions and move traces are saved with each report, so replay does not depend on the current challenge library.

Refresh or switch tabs during a benchmark: its pending job is saved and polling resumes when you return to Benchmark, provided the server has not restarted. Saved results survive server restarts. Storage is local to this browser and site address; clearing site data removes it. Storage failures display a warning rather than silently claiming results are saved.

## CLI

```sh
bun run src/cli/run.ts --list --validate
bun run src/cli/run.ts --challenge lichess-000Zo --agent jev
bun run src/cli/run.ts --challenge lichess-000rZ --moves a1a1
bun run src/cli/bench.ts --challenges lichess-000rZ,lichess-000Zo --agents jev,laya,nimble,tev
bun run src/cli/bench.ts --challenges lichess-000rZ --agents nimble --choice-limit 20
bun run src/cli/run.ts --replay /tmp/replay-report.json
```

Live providers need environment credentials only (never files or code). Copy [`.env.example`](.env.example) to `.env` for the full list. JEV requires an API key and endpoint; Laya, Nimble, and Tev are keyless local endpoints:

```sh
JEV_API_KEY=... JEV_ENDPOINT=... bun run src/cli/run.ts --challenge lichess-000rZ --agent jev
LAYA_ENDPOINT=... bun run src/cli/run.ts --challenge lichess-000rZ --agent laya
NIMBLE_ENDPOINT=http://localhost:11434/v1/systemone bun run src/cli/run.ts --challenge lichess-000rZ --agent nimble
TEV_ENDPOINT=http://localhost:11434/v1/systemone TEV_MODEL=tev-latest bun run src/cli/run.ts --challenge lichess-000rZ --agent tev
```

Each provider's default model id is overridable at runtime — no code change required:

```sh
JEV_MODEL=jev-2025-10 JEV_API_KEY=... JEV_ENDPOINT=... bun run src/cli/run.ts --challenge lichess-000rZ --agent jev
```

Or pass `--model` on the command line to override for a single run:

```sh
bun run src/cli/run.ts --challenge lichess-000rZ --agent tev --model tev-experimental
```

## Adding a new provider

All provider config lives in one place: `src/agents/registry.ts`. The CLI, server, and benchmark runner derive everything — agent construction, availability checks, model defaults, and error messages — from that map. To add a new provider:

**1. Add a record to `PROVIDER_REGISTRY` in `src/agents/registry.ts`:**

```ts
acme: {
  apiKeyEnv: "ACME_API_KEY",
  endpointEnv: "ACME_ENDPOINT",
  modelEnv: "ACME_MODEL",
  defaultModel: "acme-latest",
  requireApiKey: true,       // false for keyless/local servers
  criteriaAsDict: false,     // true to send move choices as {label: description}
},
```

**2. Add the key to the `Provider` union in `src/agents/protocol/types.ts`:**

```ts
export type Provider = "jev" | "laya" | "nimble" | "tev" | "acme" | "mock";
```

**3. Add credentials to `.env`** (see `.env.example` for the pattern):

```sh
ACME_API_KEY=...
ACME_ENDPOINT=https://...
ACME_MODEL=           # optional; omit to use the defaultModel above
```

That's it. The CLI accepts `--agent acme`, the benchmark server exposes it in `/api/agents`, and the UI offers it in the benchmark setup screen automatically.

If the provider needs custom request or response handling beyond the two flags, create `src/agents/agent-adapters/acme.ts` extending `HttpProviderAgent` and override `buildRequestBody` / `parseResponseBody`. The `createAgent` factory in `registry.ts` can be updated to use that class for the `acme` key while everything else stays the same.

## Layout

- `src/engine/` — headless rules + run loop (imports `chess.js` only; boundary-tested)
- `src/agents/` — one provider-agnostic `Agent` interface, split by role:
  - `registry.ts` — **single source of truth** for all providers; add a record here to register a new one
  - `agent-adapters/` — optional per-provider overrides for wire format (`jev.ts`, `laya.ts`, `nimble.ts`, `tev1.ts`); most providers need no adapter file
  - `protocol/` — the wire format (`reasoning.ts`) and the `Agent`/`ChallengeState` contract (`types.ts`)
  - `shared/` — the HTTP transport every adapter inherits (`http-agent.ts`) and default model resolution (`defaults.ts`)
  - `runner.ts` — top-level orchestration (`runAgentChallenge`)
- `tests/fixtures/` — scripted mock agent and solution lines for hermetic tests only
- `src/benchmark/` — suite runner + aggregate scoring
- `src/challenges/` — library loader (see `challenges/README.md` to add puzzles)
- `src/ui/` — React board, trace/compare views, benchmark screen (`server.ts` serves UI + read-only challenge API)
- `challenges/` — puzzle data (outside application source)
