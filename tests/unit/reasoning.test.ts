import { describe, expect, test } from "bun:test";
import { Chess } from "chess.js";
import {
  BEST_MOVE_QUESTION,
  bestMoveInstructions,
  buildReasoningRequest,
  legalMovesWithDescriptions,
  parseStructuredAnswer,
  renderAsciiBoard,
  selectChoices,
} from "../../src/agents/protocol/reasoning.ts";
import { ChallengeState } from "../../src/agents/protocol/types.ts";

const SCHOLARS_FEN = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w - - 0 1";

const STATE: ChallengeState = {
  challengeId: "mate-in-1-001",
  fen: SCHOLARS_FEN,
  sideToMove: "white",
  mateInN: 1,
  solverMovesUsed: 0,
  movesRemaining: 1,
  history: [],
  legalMoves: ["h5f7"],
};

describe("reasoning protocol", () => {
  test("request carries full state, objective, history, and one best_move question", () => {
    const req = buildReasoningRequest(STATE, "jev-latest");
    expect(req.state.fen).toBe(SCHOLARS_FEN);
    expect(req.state.sideToMove).toBe("white");
    expect(req.state.objective).toEqual({ type: "mate_in", movesRemaining: 1 });
    expect(req.state.history).toEqual([]);
    expect(req.model).toBe("jev-latest");
    expect(req.state.board).toContain("Q");
    expect(Object.keys(req.questions)).toEqual([BEST_MOVE_QUESTION]);
    const q = req.questions.best_move;
    expect(q.type).toBe("choice");
    expect(q.instructions).toBe(bestMoveInstructions(1));
    expect(q.instructions).toContain("1 move left");
  });

  test("bestMoveInstructions varies by movesRemaining", () => {
    expect(bestMoveInstructions(1)).toContain("1 move left");
    expect(bestMoveInstructions(1)).not.toContain("moves left");
    expect(bestMoveInstructions(2)).toContain("2 moves left");
    expect(bestMoveInstructions(3)).toContain("3 moves left");
  });

  test("criteria are the SAN labels of every legal move", () => {
    const req = buildReasoningRequest(STATE, "m");
    const verbose = new Chess(SCHOLARS_FEN).moves({ verbose: true });
    expect(req.questions.best_move.criteria).toHaveLength(verbose.length);
    expect(req.questions.best_move.criteria).toContain("Qxf7#");
    expect(req.questions.best_move.criteria.every((c) => typeof c === "string")).toBe(true);
    expect(new Set(req.questions.best_move.criteria).size).toBe(verbose.length);
  });

  test("ascii board is deterministic and shows ranks, files, and pieces", () => {
    const a = renderAsciiBoard(SCHOLARS_FEN);
    const b = renderAsciiBoard(SCHOLARS_FEN);
    expect(a).toBe(b);
    expect(a).toContain("8 r . b q k b n r");
    expect(a).toContain("a b c d e f g h");
    expect(a.split("\n")).toHaveLength(9);
  });

  test("parser maps the answered SAN label back to UCI and ignores extras", () => {
    const moves = legalMovesWithDescriptions(SCHOLARS_FEN);
    expect(
      parseStructuredAnswer(
        { answers: { best_move: { choice: "Qxf7#", confidence: 0.99 } } },
        moves,
      ),
    ).toBe("h5f7");
  });

  test("selectChoices keeps the required move within the limit, deterministically", () => {
    const moves = legalMovesWithDescriptions(SCHOLARS_FEN);
    expect(moves.length).toBeGreaterThan(20);
    const limited = selectChoices(moves, 5, "h5f7"); // h5f7 = Qxf7#
    expect(limited).toHaveLength(5);
    expect(limited.map((m) => m.uci)).toContain("h5f7");
    expect(selectChoices(moves, 5, "h5f7")).toEqual(limited);
    expect(new Set(limited.map((m) => m.uci)).size).toBe(5);
    // The mating move ranks first among distractors when slots are scarce.
    expect(selectChoices(moves, 1, "h5f7").map((m) => m.uci)).toEqual(["h5f7"]);
  });

  test("selectChoices returns every move when the limit is not binding", () => {
    const moves = legalMovesWithDescriptions(SCHOLARS_FEN);
    expect(selectChoices(moves, moves.length, "h5f7")).toEqual(moves);
    expect(selectChoices(moves, moves.length + 5)).toEqual(moves);
  });

  test("parser yields null for unknown labels, missing mapping, and non-objects", () => {
    const moves = legalMovesWithDescriptions(SCHOLARS_FEN);
    expect(parseStructuredAnswer({ answers: { best_move: { choice: "Kxe8" } } }, moves)).toBeNull();
    expect(parseStructuredAnswer({ answers: {} }, moves)).toBeNull();
    expect(parseStructuredAnswer({ best_move: "h5f7" }, moves)).toBeNull();
    expect(parseStructuredAnswer({ answers: { best_move: { choice: 42 } } }, moves)).toBeNull();
    expect(parseStructuredAnswer("Qxf7#", moves)).toBeNull();
    expect(parseStructuredAnswer(null, moves)).toBeNull();
  });
});
