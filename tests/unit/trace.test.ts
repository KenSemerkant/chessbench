import { describe, expect, test } from "bun:test";
import { failingPly } from "../../src/ui/components/TraceView.tsx";
import { ChallengeRun } from "../../src/engine/types.ts";

function run(status: ChallengeRun["status"], moves: ChallengeRun["moves"]): ChallengeRun {
  return {
    id: "r",
    challengeId: "c",
    agentId: "a",
    startedAt: "",
    status,
    failReason: status === "failed" ? "budget_exhausted" : null,
    solverMoveCount: 1,
    moves,
  };
}

const move = (ply: number, uci: string, source: "solver" | "defender" = "solver") => ({
  ply,
  side: "white" as const,
  source,
  uci,
  san: uci,
  resultingFen: "fen",
  atMs: 0,
});

describe("failing ply (US4)", () => {
  test("solved and in-progress runs have no failing ply", () => {
    expect(failingPly(run("solved", [move(1, "h5f7")]))).toBeNull();
    expect(failingPly(run("in_progress", [move(1, "e2e4")]))).toBeNull();
  });

  test("rejected attempt is the failing ply", () => {
    const bad = {
      ...move(2, "e2e5"),
      rejected: { reason: "illegal_move" as const, detail: "illegal" },
    };
    expect(failingPly(run("failed", [move(1, "a2a3"), bad]))).toBe(2);
  });

  test("budget exhaustion points at the last solver move", () => {
    expect(
      failingPly(run("failed", [move(1, "a2a3"), move(2, "a7a6", "defender"), move(3, "a3a4")])),
    ).toBe(3);
  });
});
