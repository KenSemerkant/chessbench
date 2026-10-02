import { useEffect, useState } from "react";
import { Challenge, ChallengeRun } from "../../engine/types.ts";
import { benchmarkFrames } from "../benchmark-playback.ts";
import { inCheckFromFen } from "../fen-check.ts";
import { turnFromFen } from "../fen.ts";
import { Board } from "./Board.tsx";
import { MoveHistory } from "./MoveHistory.tsx";

interface LiveBenchmarkProps {
  runs: ChallengeRun[];
  challenges: Challenge[];
  totalRuns: number;
  completedRuns: number;
  finished: boolean;
  onResults: () => void;
}

export function LiveBenchmark({ runs, challenges, totalRuns, completedRuns, finished, onResults }: LiveBenchmarkProps): JSX.Element {
  const frames = benchmarkFrames(runs, challenges);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(4);
  const frame = frames[Math.min(index, Math.max(0, frames.length - 1))];
  const caughtUp = index >= frames.length - 1;

  useEffect(() => {
    if (paused || caughtUp) return;
    const timer = setTimeout(() => setIndex((value) => value + 1), (frame?.outcome ? 1600 : 750) / speed);
    return () => clearTimeout(timer);
  }, [paused, caughtUp, index, frame?.outcome, speed]);

  const visibleMoves = frame?.run.moves.slice(0, frame.ply) ?? [];
  const last = visibleMoves.filter((move) => !move.rejected).at(-1);
  const status = frame?.outcome ? frame.run.status : "in_progress";

  return (
    <section className="live-benchmark" aria-labelledby="live-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{finished ? "Benchmark playback" : "Live benchmark"}</p>
          <h1 id="live-heading">{frame?.challenge.title ?? "Taking the board"}</h1>
          <p className="muted">{frame ? `${frame.run.agentId.toUpperCase()} · ${frame.run.model ?? ""} · Mate in ${frame.challenge.mateInN}` : "Waiting for the first agent to begin…"}</p>
        </div>
        <span className={`badge ${finished ? "" : "live-badge"}`}>{finished ? "Recorded" : "Live"}</span>
      </div>
      <div className="suite-progress">
        <span role="status">Progress: {completedRuns} of {totalRuns} runs complete</span>
        <progress value={completedRuns} max={Math.max(1, totalRuns)} aria-label="Benchmark progress" />
      </div>
      <div className="studio-grid">
        <div className="board-stage">
          {frame ? (
            <Board
              view={{ fen: frame.fen, turnColor: turnFromFen(frame.fen), check: inCheckFromFen(frame.fen),
                lastMove: last ? [last.uci.slice(0, 2), last.uci.slice(2, 4)] : null,
                dests: new Map(), orientation: frame.challenge.sideToMove }}
              interactive={false} onMove={() => {}}
            />
          ) : <div className="board-placeholder">Your benchmark will appear here.</div>}
          <div className="watch-controls">
            <button type="button" onClick={() => setPaused((value) => !value)}>{paused ? "Resume viewing" : "Pause viewing"}</button>
            <label>Speed <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option>
            </select></label>
            <button type="button" disabled={caughtUp} onClick={() => { setIndex(Math.max(0, frames.length - 1)); setPaused(false); }}>Catch up</button>
          </div>
          <p className="watch-note muted">{paused ? "Viewing paused. Agents are still running." : finished && caughtUp ? "Playback complete." : caughtUp ? "Caught up. Waiting for the agent’s next move." : "Following every move. Playback pacing does not affect benchmark timing."}</p>
        </div>
        <aside className="analysis-panel">
          <div className="section-heading compact">
            <h2>At the board</h2>
            <span className={`badge ${status === "solved" ? "success" : status === "failed" ? "danger" : ""}`}>
              {frame?.outcome ? status : "Thinking / playing"}
            </span>
          </div>
          {frame?.outcome && frame.run.failReason && <p className="failed">{frame.run.failReason.replaceAll("_", " ")}</p>}
          <MoveHistory moves={visibleMoves} />
          <h3>Run order</h3>
          <ol className="run-queue">
            {runs.map((run, runIndex) => (
              <li key={run.id} className={runIndex === frame?.runIndex ? "current" : ""}>
                <span>{challenges.find((challenge) => challenge.id === run.challengeId)?.title ?? run.challengeId}</span>
                <small>{run.agentId} · {runIndex < (frame?.runIndex ?? 0) || (runIndex === frame?.runIndex && frame.outcome) ? run.status : runIndex === frame?.runIndex ? "watching" : "up next"}</small>
              </li>
            ))}
          </ol>
          {finished && <button className="primary" type="button" onClick={onResults}>View results</button>}
        </aside>
      </div>
    </section>
  );
}
