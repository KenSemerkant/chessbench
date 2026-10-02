import { Chess } from "chess.js";
import { Challenge, ChallengeLoadError, Color, Difficulty } from "./types.ts";

const SIDE_TO_MOVE: Record<string, Color> = { w: "white", b: "black" };
const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function fail(file: string, field: string, reason: string): never {
  throw new ChallengeLoadError(file, field, reason);
}

/**
 * Validate a raw parsed-JSON challenge definition against the structural
 * rules (research D5). Mate-in-N solvability is trusted from curation —
 * this checks structure, not provability. Throws ChallengeLoadError naming
 * file + field + reason.
 */
export function validateChallenge(data: unknown, file: string): Challenge {
  if (!isRecord(data)) {
    fail(file, "(root)", "challenge definition must be a JSON object");
  }

  const id: unknown = data.id;
  if (typeof id !== "string" || id.length === 0) fail(file, "id", "must be a non-empty string");

  const title: unknown = data.title;
  if (typeof title !== "string" || title.length === 0) {
    fail(file, "title", "must be a non-empty string");
  }

  const description: unknown = data.description;
  if (description !== undefined && typeof description !== "string") {
    fail(file, "description", "must be a string when present");
  }

  const fen: unknown = data.fen;
  if (typeof fen !== "string" || fen.length === 0) {
    fail(file, "fen", "must be a non-empty FEN string");
  }

  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    fail(file, "fen", "does not parse as a valid FEN position");
  }

  const sideToMove: unknown = data.sideToMove;
  if (sideToMove !== "white" && sideToMove !== "black") {
    fail(file, "sideToMove", 'must be "white" or "black"');
  }
  const fenSideField = fen.split(" ")[1];
  if (SIDE_TO_MOVE[fenSideField] !== sideToMove) {
    fail(
      file,
      "sideToMove",
      `declares "${sideToMove}" but FEN side-to-move field is "${fenSideField}"`,
    );
  }

  const kings = game
    .board()
    .flat()
    .filter((sq) => sq !== null && sq.type === "k");
  if (kings.length !== 2) {
    fail(file, "fen", `must contain exactly two kings, found ${kings.length}`);
  }

  if (game.isCheckmate()) fail(file, "fen", "position is already checkmate");
  if (game.isStalemate()) fail(file, "fen", "position is already stalemate");
  if (game.isInsufficientMaterial()) {
    fail(file, "fen", "position is dead (insufficient material)");
  }

  const mateInN: unknown = data.mateInN;
  if (!Number.isInteger(mateInN) || (mateInN as number) < 1) {
    fail(file, "mateInN", "must be a positive integer");
  }

  const difficulty: unknown = data.difficulty ?? "medium";
  if (
    difficulty !== "easy" &&
    difficulty !== "medium" &&
    difficulty !== "hard"
  ) {
    fail(file, "difficulty", 'must be one of "easy", "medium", "hard"');
  }

  const tags: unknown = data.tags ?? [];
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
    fail(file, "tags", "must be an array of strings when present");
  }

  let solution: string[] | undefined;
  if (data.solution !== undefined) {
    const raw = data.solution;
    if (!Array.isArray(raw) || !raw.every((m) => typeof m === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))) {
      fail(file, "solution", "must be an array of UCI moves when present");
    }
    // The deterministic defender may allow mate sooner than the worst case,
    // so the proven line is between 1 and mateInN solver moves long.
    if (raw.length < 1 || raw.length > (mateInN as number)) {
      fail(file, "solution", `must contain between 1 and ${mateInN as number} solver move(s)`);
    }
    solution = raw as string[];
  }

  let source: Challenge["source"];
  if (data.source !== undefined) {
    const raw = data.source;
    if (!isRecord(raw) || raw.provider !== "lichess" || raw.license !== "CC0-1.0" ||
      typeof raw.puzzleId !== "string" || !/^[a-zA-Z0-9]{5}$/.test(raw.puzzleId) ||
      raw.url !== `https://lichess.org/training/${raw.puzzleId}` ||
      typeof raw.gameUrl !== "string" || !raw.gameUrl.startsWith("https://lichess.org/") ||
      typeof raw.rating !== "number" || !Number.isInteger(raw.rating) || raw.rating < 0) {
      fail(file, "source", "must contain valid Lichess provenance, rating, and CC0 license");
    }
    source = raw as Challenge["source"];
  }

  return {
    id: id as string,
    title: title as string,
    ...(typeof description === "string" ? { description } : {}),
    fen: fen as string,
    sideToMove: sideToMove as Color,
    mateInN: mateInN as number,
    difficulty: difficulty as Difficulty,
    tags: tags as string[],
    ...(source ? { source } : {}),
    ...(solution ? { solution } : {}),
  };
}
