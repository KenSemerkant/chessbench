import { describe, expect, test } from "bun:test";
import { Chess } from "chess.js";
import { LexicographicDefender } from "../../src/engine/defender.ts";
import { EngineRun } from "../../src/engine/run.ts";
import { Challenge, ChallengeLoadError } from "../../src/engine/types.ts";
import { validateChallenge } from "../../src/engine/validation.ts";

const SCHOLARS_FEN = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w - - 0 1";
const FOOLS_FEN = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2";

function challenge(fen: string, mateInN: number): Challenge {
  const fenSide = fen.split(" ")[1] === "w" ? "white" : "black";
  return validateChallenge(
    {
      id: "test",
      title: "test",
      fen,
      sideToMove: fenSide,
      mateInN,
      difficulty: "easy",
      tags: [],
    },
    "test.json",
  );
}

describe("solver move application", () => {
  test("legal scholar's mate solves mate-in-1", () => {
    const run = new EngineRun(challenge(SCHOLARS_FEN, 1), "human");
    const res = run.applySolverMove("h5f7");
    expect(res.status).toBe("solved");
    expect(res.failReason).toBeNull();
    expect(res.appliedMove?.san).toBe("Qxf7#");
    expect(run.snapshot().solverMoveCount).toBe(1);
  });

  test("black-to-move fool's mate solves", () => {
    const run = new EngineRun(challenge(FOOLS_FEN, 1), "human");
    const res = run.applySolverMove("d8h4");
    expect(res.status).toBe("solved");
    expect(res.appliedMove?.san).toBe("Qh4#");
  });

  test("illegal move fails the run with board unchanged", () => {
    const run = new EngineRun(challenge(SCHOLARS_FEN, 1), "human");
    const before = run.snapshot().fen;
    const res = run.applySolverMove("e2e5");
    expect(res.status).toBe("failed");
    expect(res.failReason).toBe("illegal_move");
    expect(res.appliedMove).toBeNull();
    expect(run.snapshot().fen).toBe(before);
    expect(run.snapshot().moves[0].rejected?.reason).toBe("illegal_move");
  });

  test("malformed UCI fails the run", () => {
    for (const bad of ["", "e2", "Qxf7", "i9i5", "e7e8x"]) {
      const r = new EngineRun(challenge(SCHOLARS_FEN, 1), "human");
      expect(r.applySolverMove(bad).failReason).toBe("malformed_move");
    }
  });

  test("non-mating legal move exhausts mate-in-1 budget", () => {
    const run = new EngineRun(challenge(SCHOLARS_FEN, 3), "human");
    const res = run.applySolverMove("a2a3");
    expect(res.status).toBe("in_progress");
    expect(res.defenderMove).not.toBeNull();
    const narrow = new EngineRun(challenge(SCHOLARS_FEN, 1), "human");
    narrow.applySolverMove("a2a3");
    const second = narrow.applySolverMove("a3a4");
    expect(second.status).toBe("failed");
    expect(second.failReason).toBe("budget_exhausted");
  });

  test("mate-in-2 line solves with defender auto-reply", () => {
    const run = new EngineRun(challenge("k7/8/2K5/8/8/8/3Q4/8 w - - 0 1", 2), "human");
    const first = run.applySolverMove("c6c7");
    expect(first.status).toBe("in_progress");
    expect(first.defenderMove?.uci).toBe("a8a7");
    const second = run.applySolverMove("d2a5");
    expect(second.status).toBe("solved");
    expect(run.snapshot().solverMoveCount).toBe(2);
  });

  test("solver move producing stalemate fails as stalemate", () => {
    const run = new EngineRun(challenge("k7/8/1Q6/8/8/8/8/1K6 w - - 0 1", 2), "human");
    const res = run.applySolverMove("b6c7");
    expect(res.status).toBe("failed");
    expect(res.failReason).toBe("stalemate");
  });

  test("already-stalemate position rejected at load", () => {
    expect(() =>
      challenge("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", 3),
    ).toThrow(ChallengeLoadError);
  });

  test("dead position (K vs K) fails even if it bypassed loading", () => {
    // The loader rejects dead positions (see validation tests); the engine
    // must still fail gracefully if handed one directly.
    const dead: Challenge = {
      id: "dead",
      title: "dead",
      fen: "k7/8/8/8/8/8/8/K7 w - - 0 1",
      sideToMove: "white",
      mateInN: 3,
      difficulty: "easy",
      tags: [],
    };
    const run = new EngineRun(dead, "human");
    const res = run.applySolverMove("a1a2");
    expect(res.status).toBe("failed");
    expect(res.failReason).toBe("dead_position");
  });

  test("promotion suffix required and applied", () => {
    const fen = "8/5P1k/8/8/8/8/6K1/8 w - - 0 1";
    const missing = new EngineRun(challenge(fen, 2), "human");
    expect(missing.applySolverMove("f7f8").failReason).toBe("illegal_move");
    const good = new EngineRun(challenge(fen, 2), "human");
    const ok = good.applySolverMove("f7f8q");
    expect(ok.appliedMove).not.toBeNull();
    expect(ok.status).toBe("in_progress");
  });

  test("defender replies are deterministic across runs", () => {
    const play = () => {
      const run = new EngineRun(challenge(SCHOLARS_FEN, 3), "human");
      run.applySolverMove("e2e3");
      return run.snapshot().moves.map((m) => m.uci);
    };
    expect(play()).toEqual(play());
  });

  test("lexicographic defender picks smallest UCI", () => {
    const d = new LexicographicDefender();
    const expected = new Chess(SCHOLARS_FEN)
      .moves({ verbose: true })
      .map((m) => m.from + m.to + (m.promotion ?? ""))
      .sort()[0];
    expect(d.chooseMove(SCHOLARS_FEN)).toBe(expected);
  });

  test("moves after terminal state are no-ops", () => {
    const run = new EngineRun(challenge(SCHOLARS_FEN, 1), "human");
    run.applySolverMove("h5f7");
    const res = run.applySolverMove("e2e4");
    expect(res.status).toBe("solved");
    expect(res.appliedMove).toBeNull();
    expect(run.snapshot().moves).toHaveLength(1);
  });
});
