import { Chess } from "chess.js";
import { Challenge, RunStatus } from "./types.ts";

export interface ReplayOutcome {
  reproduced: boolean;
  finalFen: string;
  status: RunStatus;
}

/**
 * Deterministic replay (FR-018): re-apply recorded UCIs from the challenge
 * FEN through a fresh position and compare against the recorded outcome.
 * Uses no timestamps and no agent — identical output proves determinism.
 */
export function replay(
  challenge: Challenge,
  ucis: string[],
  expected: { fen: string; status: RunStatus },
): ReplayOutcome {
  const game = new Chess(challenge.fen);
  try {
    for (const uci of ucis) {
      game.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length === 5 ? uci[4] : undefined,
      });
    }
  } catch {
    return { reproduced: false, finalFen: game.fen(), status: "failed" };
  }
  const finalFen = game.fen();
  const status: RunStatus = game.isCheckmate() ? "solved" : "failed";
  return {
    reproduced: finalFen === expected.fen && status === expected.status,
    finalFen,
    status,
  };
}
