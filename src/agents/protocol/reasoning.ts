import { Chess, Square } from "chess.js";
import { ChallengeState } from "./types.ts";

export const BEST_MOVE_QUESTION = "best_move";

/** Build the question instructions for a given number of moves remaining. */
export function bestMoveInstructions(movesRemaining: number): string {
  return movesRemaining === 1
    ? "There is 1 move left to achieve checkmate. Which move delivers mate?"
    : `There are ${movesRemaining} moves left to achieve checkmate. Which move should be played next?`;
}

export interface ChoiceCriterion {
  value: string;
  description: string;
}

export interface ChoiceQuestion {
  name: typeof BEST_MOVE_QUESTION;
  type: "choice";
  instructions: string;
  /** Wire labels: one SAN string per legal move (models answer with a label). */
  criteria: string[];
}

export interface ReasoningRequest {
  state: {
    fen: string;
    board: string;
    sideToMove: "white" | "black";
    objective: { type: "mate_in"; movesRemaining: number };
    history: string[];
  };
  model: string;
  questions: { best_move: ChoiceQuestion };
}

/** Plain ASCII board diagram derived from a FEN (deterministic per position). */
export function renderAsciiBoard(fen: string): string {
  const game = new Chess(fen);
  const lines: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    const cells: string[] = [];
    for (let file = 0; file < 8; file++) {
      const square = `${"abcdefgh"[file]}${rank}` as Square;
      const piece = game.get(square);
      cells.push(piece ? (piece.color === "w" ? piece.type.toUpperCase() : piece.type) : ".");
    }
    lines.push(`${rank} ${cells.join(" ")}`);
  }
  lines.push("  a b c d e f g h");
  return lines.join("\n");
}

/** Every legal move as {uci, san} pairs from chess.js verbose output. */
export function legalMovesWithDescriptions(fen: string): Array<{ uci: string; san: string }> {
  return new Chess(fen)
    .moves({ verbose: true })
    .map((m) => ({ uci: m.from + m.to + (m.promotion ?? ""), san: m.san }));
}

/**
 * Reduce a move list to at most `limit` candidates for a bounded choice head.
 * The required move (the proven solution) is always kept. Remaining slots go
 * to the most forcing moves (mate > check > capture > quiet, SAN tiebreak), so
 * the distractors stay plausible. Returns a deterministic SAN-sorted list.
 */
export function selectChoices(
  moves: Array<{ uci: string; san: string }>,
  limit: number,
  requiredUci?: string,
): Array<{ uci: string; san: string }> {
  if (limit >= moves.length) return moves;
  const rank = (san: string): number =>
    san.includes("#") ? 0 : san.includes("+") ? 1 : san.includes("x") ? 2 : 3;
  const required = requiredUci ? moves.find((m) => m.uci === requiredUci) : undefined;
  const rest = moves
    .filter((m) => m.uci !== required?.uci)
    .sort((a, b) => rank(a.san) - rank(b.san) || a.san.localeCompare(b.san));
  const chosen = required ? [required, ...rest.slice(0, Math.max(0, limit - 1))] : rest.slice(0, limit);
  return chosen.sort((a, b) => a.san.localeCompare(b.san));
}

/** The single v1 choice question over a position's legal moves. */
export function buildBestMoveQuestion(fen: string, instructions: string): ChoiceQuestion {
  return {
    name: BEST_MOVE_QUESTION,
    type: "choice",
    instructions,
    criteria: legalMovesWithDescriptions(fen).map((m) => m.san),
  };
}

/** Build one turn's reasoning request (contracts/reasoning-protocol.md). */
export function buildReasoningRequest(
  state: ChallengeState,
  model: string,
): ReasoningRequest {
  return {
    state: {
      fen: state.fen,
      board: renderAsciiBoard(state.fen),
      sideToMove: state.sideToMove,
      objective: { type: "mate_in", movesRemaining: state.movesRemaining },
      history: [...state.history],
    },
    model,
    questions: {
      best_move: buildBestMoveQuestion(state.fen, bestMoveInstructions(state.movesRemaining)),
    },
  };
}

/**
 * Extract the solver move from a structured answer payload. Reads the SAN
 * label at `answers.best_move.choice` and maps it back to UCI via the
 * position's legal moves. Anything else (missing mapping, unknown label,
 * non-object) yields null (→ malformed downstream). Extras ignored.
 */
export function parseStructuredAnswer(
  payload: unknown,
  moves: Array<{ uci: string; san: string }>,
): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const answers = (payload as Record<string, unknown>).answers;
  if (typeof answers !== "object" || answers === null) return null;
  const best = (answers as Record<string, unknown>)[BEST_MOVE_QUESTION];
  if (typeof best !== "object" || best === null) return null;
  const choice = (best as Record<string, unknown>).choice;
  if (typeof choice !== "string") return null;
  return moves.find((m) => m.san === choice)?.uci ?? null;
}
