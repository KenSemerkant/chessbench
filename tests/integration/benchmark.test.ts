import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { MockAgent } from "../fixtures/mock-agent.ts";
import { SOLUTIONS } from "../fixtures/solutions.ts";
import { runSuite } from "../../src/benchmark/runner.ts";
import { scoreAgents } from "../../src/benchmark/scoring.ts";
import { getChallenge, loadLibrary } from "../../src/challenges/library.ts";
import { replay } from "../../src/engine/replay.ts";

const CHALLENGES_DIR = join(import.meta.dir, "..", "fixtures", "challenges");

describe("benchmark comparison (US3)", () => {
  test("two agents start identical and both solve", async () => {
    const { challenges } = await loadLibrary(CHALLENGES_DIR);
    const selected = ["mate-in-1-001", "mate-in-2-001"].map((id) =>
      getChallenge(challenges, id),
    );
    const report = await runSuite({
      suiteId: "us3-test",
      challenges: selected,
      agents: [
        new MockAgent({ id: "mock-a", script: [], scripts: SOLUTIONS }),
        new MockAgent({ id: "mock-b", script: [], scripts: SOLUTIONS }),
      ],
    });

    expect(report.challengeIds).toEqual(["mate-in-1-001", "mate-in-2-001"]);
    expect(report.runs).toHaveLength(4);
    expect(report.runs.every((r) => r.status === "solved")).toBe(true);

    // Identical starting positions: same challenge ⇒ same opening FEN lineage.
    for (const run of report.runs) {
      const challenge = getChallenge(challenges, run.challengeId);
      const firstFen = run.moves[0].resultingFen;
      expect(firstFen).not.toBe(challenge.fen);
      // Every run reproduces exactly through the engine.
      const outcome = replay(
        challenge,
        run.moves.filter((m) => !m.rejected).map((m) => m.uci),
        { fen: run.moves.at(-1)!.resultingFen, status: run.status },
      );
      expect(outcome.reproduced).toBe(true);
    }

    // Same-challenge runs across agents are move-identical (deterministic defender).
    const a = report.runs.find((r) => r.challengeId === "mate-in-2-001" && r.agentId === "mock-a")!;
    const b = report.runs.find((r) => r.challengeId === "mate-in-2-001" && r.agentId === "mock-b")!;
    expect(a.moves.map((m) => m.uci)).toEqual(b.moves.map((m) => m.uci));

    // Both agents solve everything; ranking between identical scores is
    // elapsed-time noise, so compare order-insensitively.
    const ranked = [...report.scores].sort((x, y) => x.agentId.localeCompare(y.agentId));
    expect(ranked.map((s) => [s.agentId, s.solved, s.total, s.score])).toEqual([
      ["mock-a", 2, 2, 1],
      ["mock-b", 2, 2, 1],
    ]);
  });

  test("scoring ranks by score, then moves, then time", () => {
    const scores = scoreAgents(
      [
        {
          id: "r1",
          challengeId: "c",
          agentId: "slow",
          startedAt: "",
          status: "solved",
          failReason: null,
          solverMoveCount: 3,
          moves: [],
          elapsedMs: 100,
        },
        {
          id: "r2",
          challengeId: "c",
          agentId: "fast",
          startedAt: "",
          status: "solved",
          failReason: null,
          solverMoveCount: 1,
          moves: [],
          elapsedMs: 900,
        },
        {
          id: "r3",
          challengeId: "c",
          agentId: "loser",
          startedAt: "",
          status: "failed",
          failReason: "budget_exhausted",
          solverMoveCount: 2,
          moves: [],
          elapsedMs: 10,
        },
      ],
      new Map([
        ["slow", "m"],
        ["fast", "m"],
        ["loser", "m"],
      ]),
    );
    expect(scores.map((s) => s.agentId)).toEqual(["fast", "slow", "loser"]);
  });
});
