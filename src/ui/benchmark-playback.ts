import { Challenge, ChallengeRun } from "../engine/types.ts";

export interface PlaybackFrame {
  run: ChallengeRun;
  challenge: Challenge;
  runIndex: number;
  ply: number;
  outcome: boolean;
  fen: string;
}

/** Include a starting position, every recorded attempt, and a brief outcome frame per run. */
export function benchmarkFrames(runs: ChallengeRun[], challenges: Challenge[]): PlaybackFrame[] {
  return runs.flatMap((run, runIndex) => {
    const challenge = challenges.find((entry) => entry.id === run.challengeId);
    if (!challenge) return [];
    const frame = (ply: number, outcome = false): PlaybackFrame => ({
      run, challenge, runIndex, ply, outcome,
      fen: ply === 0 ? challenge.fen : run.moves[ply - 1].resultingFen,
    });
    return [
      frame(0),
      ...run.moves.map((_, index) => frame(index + 1)),
      ...(run.status !== "in_progress" ? [frame(run.moves.length, true)] : []),
    ];
  });
}
