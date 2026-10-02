import { useState } from "react";
import type * as cg from "@lichess-org/chessground/types";
import { Challenge, ChallengeRun } from "../../engine/types.ts";
import { inCheckFromFen } from "../fen-check.ts";
import { turnFromFen } from "../fen.ts";
import { Board, BoardView } from "./Board.tsx";
import { MoveHistory } from "./MoveHistory.tsx";

interface ReplayViewerProps {
  challenge: Challenge;
  run: ChallengeRun;
  onClose: () => void;
}

/**
 * Step through a completed run's recorded plies (FR-037). Positions come
 * from each move's recorded resultingFen — no re-computation, no agent.
 */
export function ReplayViewer({ challenge, run, onClose }: ReplayViewerProps): JSX.Element {
  const applied = run.moves.filter((m) => !m.rejected);
  const [index, setIndex] = useState(applied.length);
  const fen = index === 0 ? challenge.fen : applied[index - 1].resultingFen;
  const turn = turnFromFen(fen);
  const visible = index >= applied.length ? run.moves : applied.slice(0, index);
  const last = index > 0 ? applied[index - 1] : null;
  const view: BoardView = {
    fen,
    turnColor: turn as cg.Color,
    check: inCheckFromFen(fen),
    lastMove: last ? [last.uci.slice(0, 2), last.uci.slice(2, 4)] : null,
    dests: new Map(),
    orientation: challenge.sideToMove as cg.Color,
  };

  return (
    <div className="replay">
      <h2>
        Replay — {run.challengeId} by {run.agentId} ({run.status})
      </h2>
      <div className="play-area">
        <Board view={view} interactive={false} onMove={() => {}} />
        <div className="side">
          <div className="replay-controls">
            <button type="button" disabled={index === 0} onClick={() => setIndex(0)}>
              |◀
            </button>
            <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              ◀
            </button>
            <span>
              {index}/{applied.length}
            </span>
            <button
              type="button"
              disabled={index === applied.length}
              onClick={() => setIndex(index + 1)}
            >
              ▶
            </button>
            <button
              type="button"
              disabled={index === applied.length}
              onClick={() => setIndex(applied.length)}
            >
              ▶|
            </button>
          </div>
          <MoveHistory moves={visible} />
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
