import { Chess, Move as ChessJsMove } from "chess.js";
import { DefenderPolicy, LexicographicDefender } from "./defender.ts";
import { Challenge, ChallengeRun, Color, FailReason, Move, RunStatus } from "./types.ts";

export interface ApplyResult {
  status: RunStatus;
  failReason: FailReason | null;
  /** Solver ply just applied; null when the input was rejected or run already terminal. */
  appliedMove: Move | null;
  /** Defender auto-reply when the run continues; null otherwise. */
  defenderMove: Move | null;
  fen: string;
  inCheck: boolean;
}

export interface Snapshot {
  status: RunStatus;
  failReason: FailReason | null;
  fen: string;
  moves: Move[];
  solverMoveCount: number;
}

const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function opposite(color: Color): Color {
  return color === "white" ? "black" : "white";
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Headless challenge run (contracts/engine-interface.md). Owns the Chess
 * instance, the solver→defender turn loop, and all status transitions.
 * Invalid solver input never throws — it is recorded and fails the run.
 */
export class EngineRun {
  private readonly game: Chess;
  private readonly startedAt: string;
  private readonly startMs: number;
  private readonly moves: Move[] = [];
  private status: RunStatus = "in_progress";
  private failReason: FailReason | null = null;
  private errorDetail: string | null = null;
  private solverMoveCount = 0;

  constructor(
    private readonly challenge: Challenge,
    private readonly solverId: string,
    private readonly defender: DefenderPolicy = new LexicographicDefender(),
  ) {
    this.game = new Chess(challenge.fen);
    this.startedAt = nowIso();
    this.startMs = Date.now();
  }

  private elapsed(): number {
    return Date.now() - this.startMs;
  }

  private recordMove(
    side: Color,
    source: Move["source"],
    uci: string,
    san: string,
    resultingFen: string,
    rejected?: Move["rejected"],
    reasoning?: Move["reasoning"],
  ): Move {
    const move: Move = {
      ply: this.moves.length + 1,
      side,
      source,
      uci,
      san,
      resultingFen,
      atMs: this.elapsed(),
      ...(rejected ? { rejected } : {}),
      ...(reasoning ? { reasoning } : {}),
    };
    this.moves.push(move);
    return move;
  }

  private fail(reason: FailReason): void {
    this.status = "failed";
    this.failReason = reason;
  }

  /** Turn char ("w"/"b") of the defending side. */
  private defenderTurn(): "w" | "b" {
    return this.challenge.sideToMove === "white" ? "b" : "w";
  }

  /** Evaluate terminal conditions after any applied ply. Returns true when terminal. */
  private evaluateTerminal(): boolean {
    if (this.game.isCheckmate()) {
      if (this.game.turn() === this.defenderTurn()) {
        // Solver mated the defender.
        if (this.solverMoveCount <= this.challenge.mateInN) {
          this.status = "solved";
        } else {
          this.fail("budget_exhausted");
        }
      } else {
        // Solver was mated — mate is now impossible.
        this.fail("dead_position");
      }
      return true;
    }
    if (this.game.isStalemate()) {
      this.fail("stalemate");
      return true;
    }
    if (this.game.isInsufficientMaterial() || this.game.isThreefoldRepetition()) {
      this.fail("dead_position");
      return true;
    }
    return false;
  }

  private result(appliedMove: Move | null, defenderMove: Move | null): ApplyResult {
    return {
      status: this.status,
      failReason: this.failReason,
      appliedMove,
      defenderMove,
      fen: this.game.fen(),
      inCheck: this.game.inCheck(),
    };
  }

  /**
   * Submit one solver move (UCI). Applies the solver ply, then the defender
   * auto-reply while the run continues. Malformed or illegal input is
   * recorded, fails the run, and leaves the board unchanged. An optional
   * reasoning payload rides onto the recorded applied move (carriage only —
   * never affects validation).
   */
  applySolverMove(
    uci: string,
    reasoning?: { question: unknown; answer: unknown },
  ): ApplyResult {
    if (this.status !== "in_progress") {
      return this.result(null, null);
    }
    const side: Color = this.game.turn() === "w" ? "white" : "black";

    if (typeof uci !== "string" || !UCI_PATTERN.test(uci)) {
      this.recordMove(side, "solver", String(uci), "", this.game.fen(), {
        reason: "malformed_move",
        detail: `move ${JSON.stringify(uci)} is not a valid UCI string`,
      });
      this.fail("malformed_move");
      return this.result(null, null);
    }

    let applied: ChessJsMove;
    try {
      applied = this.game.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length === 5 ? uci[4] : undefined,
      });
    } catch {
      this.recordMove(side, "solver", uci, "", this.game.fen(), {
        reason: "illegal_move",
        detail: `move ${uci} is illegal in the current position`,
      });
      this.fail("illegal_move");
      return this.result(null, null);
    }

    this.solverMoveCount += 1;
    const solverMove = this.recordMove(side, "solver", uci, applied.san, this.game.fen(), undefined, reasoning);

    if (this.evaluateTerminal()) {
      return this.result(solverMove, null);
    }
    if (this.solverMoveCount > this.challenge.mateInN) {
      this.fail("budget_exhausted");
      return this.result(solverMove, null);
    }

    const replyUci = this.defender.chooseMove(this.game.fen());
    if (replyUci === null) {
      this.fail("dead_position");
      return this.result(solverMove, null);
    }
    const reply = this.game.move({
      from: replyUci.slice(0, 2),
      to: replyUci.slice(2, 4),
      promotion: replyUci.length === 5 ? replyUci[4] : undefined,
    });
    const defenderMove = this.recordMove(
      opposite(side),
      "defender",
      replyUci,
      reply.san,
      this.game.fen(),
    );
    this.evaluateTerminal();
    return this.result(solverMove, defenderMove);
  }

  /**
   * Abort an in-progress run without a solver move (agent timeout, provider
   * error, unavailable agent). Records no move; fails with the given reason.
   */
  abort(
    reason: Extract<FailReason, "timeout" | "agent_error" | "agent_unavailable">,
    detail: string,
  ): ApplyResult {
    if (this.status === "in_progress") {
      this.fail(reason);
      this.errorDetail = detail;
    }
    return this.result(null, null);
  }

  snapshot(): Snapshot {
    return {
      status: this.status,
      failReason: this.failReason,
      fen: this.game.fen(),
      moves: [...this.moves],
      solverMoveCount: this.solverMoveCount,
    };
  }

  /** Assemble the immutable run record once the run is terminal. */
  toRunRecord(runId: string, model?: string): ChallengeRun {
    return {
      id: runId,
      challengeId: this.challenge.id,
      agentId: this.solverId,
      ...(model !== undefined ? { model } : {}),
      startedAt: this.startedAt,
      endedAt: nowIso(),
      status: this.status,
      failReason: this.failReason,
      solverMoveCount: this.solverMoveCount,
      moves: [...this.moves],
      elapsedMs: this.elapsed(),
      ...(this.errorDetail !== null ? { error: this.errorDetail } : {}),
    };
  }
}
