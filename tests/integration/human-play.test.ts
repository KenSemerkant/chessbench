import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { getChallenge, loadLibrary } from "../../src/challenges/library.ts";
import { EngineRun } from "../../src/engine/run.ts";
import { replay } from "../../src/engine/replay.ts";

const CHALLENGES_DIR = join(import.meta.dir, "..", "fixtures", "challenges");

describe("human play (US1)", () => {
  test("library loads all seed challenges with zero errors", async () => {
    const { challenges, errors } = await loadLibrary(CHALLENGES_DIR);
    expect(errors).toEqual([]);
    expect(challenges.map((c) => c.id).sort()).toEqual([
      "mate-in-1-001",
      "mate-in-1-002",
      "mate-in-1-003",
      "mate-in-2-001",
      "mate-in-2-002",
    ]);
  });

  test("load mate-in-2, see objective, solve the full line", async () => {
    const { challenges } = await loadLibrary(CHALLENGES_DIR);
    const challenge = getChallenge(challenges, "mate-in-2-001");
    expect(challenge.sideToMove).toBe("white");
    expect(challenge.mateInN).toBe(2);

    const run = new EngineRun(challenge, "human");
    expect(run.snapshot().status).toBe("in_progress");

    const first = run.applySolverMove("c6c7");
    expect(first.appliedMove?.san).toBe("Kc7");
    expect(first.defenderMove?.uci).toBe("a8a7");
    const second = run.applySolverMove("d2a5");
    expect(second.status).toBe("solved");

    const record = run.toRunRecord("us1-test", undefined);
    expect(record.status).toBe("solved");
    expect(record.solverMoveCount).toBe(2);
    expect(record.moves).toHaveLength(3);

    const outcome = replay(
      challenge,
      record.moves.filter((m) => !m.rejected).map((m) => m.uci),
      { fen: record.moves.at(-1)!.resultingFen, status: record.status },
    );
    expect(outcome.reproduced).toBe(true);
  });

  test("illegal move leaves board unchanged with feedback", async () => {
    const { challenges } = await loadLibrary(CHALLENGES_DIR);
    const run = new EngineRun(getChallenge(challenges, "mate-in-1-001"), "human");
    const before = run.snapshot().fen;
    const res = run.applySolverMove("e2e4");
    expect(res.status).toBe("failed");
    expect(res.failReason).toBe("illegal_move");
    expect(run.snapshot().fen).toBe(before);
    expect(run.snapshot().moves[0].rejected?.detail).toMatch(/illegal/);
  });

  test("unknown challenge id throws a useful error", async () => {
    const { challenges } = await loadLibrary(CHALLENGES_DIR);
    expect(() => getChallenge(challenges, "nope")).toThrow(/unknown challenge id/);
  });
});
