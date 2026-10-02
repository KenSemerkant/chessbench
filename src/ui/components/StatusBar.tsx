import { Challenge, ChallengeRun } from "../../engine/types.ts";

interface StatusBarProps {
  challenge: Challenge;
  solverMoveCount: number;
  status: ChallengeRun["status"];
  failReason: ChallengeRun["failReason"];
  inCheck: boolean;
  onReset: () => void;
  onExit: () => void;
}

export function StatusBar({
  challenge,
  solverMoveCount,
  status,
  failReason,
  inCheck,
  onReset,
  onExit,
}: StatusBarProps): JSX.Element {
  return (
    <div className="statusbar">
      <div>
        <h2>{challenge.title}</h2>
        <p>
          {challenge.sideToMove} to move · mate in {challenge.mateInN} · used {solverMoveCount}/
          {challenge.mateInN}
          {inCheck && status === "in_progress" ? " · check!" : ""}
        </p>
        {status === "solved" && <p className="solved">Solved — checkmate delivered.</p>}
        {status === "failed" && (
          <p className="failed">Failed{failReason ? ` (${failReason})` : ""}.</p>
        )}
      </div>
      <div className="statusbar-actions">
        <button type="button" onClick={onReset}>
          Reset challenge
        </button>
        <button type="button" onClick={onExit}>
          New challenge
        </button>
      </div>
    </div>
  );
}
