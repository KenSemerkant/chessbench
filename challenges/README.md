# Challenge library

Application puzzles are sourced from the [Lichess open puzzle database](https://database.lichess.org/#puzzles), via the [official Lichess dataset on Hugging Face](https://huggingface.co/datasets/Lichess/chess-puzzles). Lichess releases database exports under **CC0-1.0**: redistribution and commercial use are permitted.

## Selection policy

The corpus target is defined by `QUOTAS` in `src/cli/import-challenges.ts`: balanced coverage across mate-in-1/2/3 and easy/medium/hard, with the extra slot allocated to mate-in-1/easy. `difficultyFor` defines fixed **puzzle rating** bands:

- Easy: below 1200.
- Medium: 1200–1799.
- Hard: 1800 and above.

Depth and difficulty are independent: a hard mate-in-1 position is possible. These are Lichess puzzle ratings at import time, not player Elo, and they are not a guarantee of how difficult an AI agent will find a position.

The importer selects the first eligible, verified positions in a bounded deterministic dataset prefix. Candidates require popularity ≥80, at least 100 plays, and rating deviation ≤100. It excludes duplicate starting positions and skips candidates exceeding the offline search node budget. This is a deliberately balanced benchmark sample, **not** a random or representative sample of all Lichess puzzles; bounded-search curation can favor simpler search trees.

## Provenance and verification

Each puzzle JSON includes `source` with its Lichess puzzle ID, puzzle/game URLs, rating, and license. IDs use `lichess-<PuzzleId>` and titles use source themes rather than invented historical names.

- `provenance/lichess-source.json`: original selected dataset rows, import timestamp, selection diagnostics, and SHA-256 of the row array.
- `provenance/mate-proofs.json`: offline exact-depth verification results and branching proof trees.

**Important conversion:** the dataset FEN precedes the opponent's setup move. The importer applies the first UCI move before saving the challenge FEN. The remaining source line must be legal and end in checkmate with the expected number of plies.

`src/challenges/mate-verifier.ts` independently searches all legal solver moves and **every legal defensive reply**, checking smaller mate depths first. It saves a winning strategy tree, not just a principal variation. Corpus tests validate that tree, reject any shorter forced mate, and execute the tree against the application's deterministic defender. Search is offline curation only: no solution or proof is sent to agents, and the runtime loader remains structural. The runtime defender is not optimal; a bad agent move can still win against that weak defense, so benchmark success is not itself proof that the agent found a forced strategy.

## Reproduce and validate

Rebuild from the frozen local rows, without network:

```sh
bun run src/cli/import-challenges.ts --source challenges/provenance/lichess-source.json
bun run src/cli/run.ts --validate
bun test tests/integration/challenge-corpus.test.ts
```

Re-import from the public dataset (explicit network operation):

```sh
bun run src/cli/import-challenges.ts
```

Downloads are cached in ignored `.cache/lichess-rows/`. The importer retries failed pages and writes challenge data only after every quota is filled. Local reproduction uses the frozen accepted rows; a fresh network import may select different puzzles as upstream ratings change. The importer does not delete obsolete puzzle files: use a clean output library when intentionally changing the corpus.

## Original seed provenance

The original `001-chess-challenges` task T002 requested a small seed set; its plan anticipated a larger mate-in-1/2/3 library. The original puzzle JSON had no source IDs, citations, ratings, or licenses. Exact external origin was not recorded. These familiar mating patterns and king/queen examples now live only in `tests/fixtures/challenges/`, preserving existing engine and adapter regressions without claiming sourced benchmark provenance.

## Add a puzzle

One JSON file per challenge, directly under `challenges/`. Required fields: unique nonempty `id`, `title`, legal non-terminal `fen`, matching `sideToMove`, and positive integer `mateInN`. `difficulty` is `easy`, `medium`, or `hard`; `tags` is an array of strings. Optional `source` must satisfy the provenance checks in `src/engine/validation.ts`.

The runtime loader checks structure, not forced-mate correctness. Curate and verify new mate claims offline before inclusion. Changes to the benchmark corpus must update its frozen source rows, proof records, and quota tests together. Provenance files stay in the subdirectory so they are not loaded as challenges.
