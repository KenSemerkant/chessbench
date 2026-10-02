/** FEN helpers for the UI (display only — all legality lives in the engine). */

export type Square = `${string}${string}`;

/** Piece letter at a square from a full FEN, e.g. "P", "k", or null when empty. */
export function pieceAt(fen: string, square: string): string | null {
  const placement = fen.split(" ")[0];
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  if (file < 0 || file > 7 || !(rank >= 1 && rank <= 8)) return null;
  const row = placement.split("/")[8 - rank];
  let f = 0;
  for (const ch of row) {
    if (/\d/.test(ch)) {
      f += Number(ch);
    } else {
      if (f === file) return ch;
      f += 1;
    }
  }
  return null;
}

/** True when a pawn move to the last rank needs a promotion choice. */
export function needsPromotionChoice(fen: string, orig: string, dest: string): boolean {
  const piece = pieceAt(fen, orig);
  if (piece !== "P" && piece !== "p") return false;
  const destRank = dest[1];
  return (piece === "P" && destRank === "8") || (piece === "p" && destRank === "1");
}

/** Side to move from a full FEN. */
export function turnFromFen(fen: string): "white" | "black" {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}
