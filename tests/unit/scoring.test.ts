import { describe, expect, test } from "bun:test";
import { scoreAgents } from "../../src/benchmark/scoring.ts";
import { ChallengeRun } from "../../src/engine/types.ts";

const run = (overrides: Partial<ChallengeRun>): ChallengeRun => ({
  id: "r",
  challengeId: "c1",
  agentId: "a",
  startedAt: "2026-01-01T00:00:00.000Z",
  status: "failed",
  failReason: "budget_exhausted",
  solverMoveCount: 0,
  moves: [],
  ...overrides,
});

const move = (uci: string) => ({
  ply: 1, side: "white" as const, source: "solver" as const, uci, san: "x",
  resultingFen: "f", atMs: 0,
});

describe("scoreAgents solution-move accuracy", () => {
  test("counts the matching prefix of solver moves against the proven solution", () => {
    const runs = [
      run({ solverMoveCount: 2, moves: [move("d1h5"), move("e2e4")], status: "solved" }),
    ];
    const solutions = new Map([["c1", ["d1h5", "f3f7"]]]);
    const [score] = scoreAgents(runs, new Map([["a", "m"]]), solutions);
    // First move matched the proven line, second diverged: 1 hit in 2 turns.
    expect(score.solutionMoveHits).toBe(1);
    expect(score.solutionMoveTurns).toBe(2);
  });

  test("counts the miss turn but not turns after divergence", () => {
    const runs = [
      run({ solverMoveCount: 2, moves: [move("a2a3"), move("d1h5")] }),
    ];
    const solutions = new Map([["c1", ["d1h5", "f3f7"]]]);
    const [score] = scoreAgents(runs, new Map([["a", "m"]]), solutions);
    // Diverged on move 1: the miss is one turn; later moves are off-line.
    expect(score.solutionMoveHits).toBe(0);
    expect(score.solutionMoveTurns).toBe(1);
  });

  test("challenges without a solution contribute no solution turns", () => {
    const runs = [run({ solverMoveCount: 1, moves: [move("d1h5")], status: "solved" })];
    const [score] = scoreAgents(runs, new Map([["a", "m"]]), new Map());
    expect(score.solutionMoveHits).toBe(0);
    expect(score.solutionMoveTurns).toBe(0);
  });

  test("solved runs along the full solution line count every turn", () => {
    const runs = [
      run({ solverMoveCount: 2, moves: [move("d1h5"), move("f3f7")], status: "solved" }),
    ];
    const solutions = new Map([["c1", ["d1h5", "f3f7"]]]);
    const [score] = scoreAgents(runs, new Map([["a", "m"]]), solutions);
    expect(score.solutionMoveHits).toBe(2);
    expect(score.solutionMoveTurns).toBe(2);
  });
});
