import { Chess } from "chess.js";

/**
 * Supplies defending-side replies (FR-016a). The policy is fixed and
 * deterministic: identical positions always yield identical replies, so
 * every run of a challenge is reproducible and replay is exact.
 */
export interface DefenderPolicy {
  /** Legal defender reply in UCI, or null when the side to move has no moves. */
  chooseMove(fen: string): string | null;
}

/** v1 policy: the lexicographically smallest legal UCI move. */
export class LexicographicDefender implements DefenderPolicy {
  chooseMove(fen: string): string | null {
    const game = new Chess(fen);
    const ucis = game
      .moves({ verbose: true })
      .map((m) => m.from + m.to + (m.promotion ?? ""))
      .sort();
    return ucis[0] ?? null;
  }
}
