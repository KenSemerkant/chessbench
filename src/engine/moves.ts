import { Chess } from "chess.js";

/** All legal moves in the position as UCI strings (promotion suffix included). */
export function legalUciMoves(fen: string): string[] {
  return new Chess(fen)
    .moves({ verbose: true })
    .map((m) => m.from + m.to + (m.promotion ?? ""));
}

/** Convert UCI list to Chessground dests (origin square → destination squares). */
export function destsFromUci(ucis: string[]): Map<string, string[]> {
  const dests = new Map<string, string[]>();
  for (const uci of ucis) {
    const orig = uci.slice(0, 2);
    const dest = uci.slice(2, 4);
    const list = dests.get(orig) ?? [];
    if (!list.includes(dest)) list.push(dest);
    dests.set(orig, list);
  }
  return dests;
}
