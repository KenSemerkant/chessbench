import { ChallengeRun, SuiteResult } from "../../engine/types.ts";

interface ResultsProps {
  report: SuiteResult;
  onReplay: (run: ChallengeRun) => void;
}

/** Scoreboard plus per-run summaries (SC-004, Story 3 scenario 2). */
export function Results({ report, onReplay }: ResultsProps): JSX.Element {
  return (
    <div className="results">
      <div className="section-heading"><div><p className="eyebrow">The scorecard</p><h2>Benchmark results</h2><p className="muted">{report.suiteId}</p></div><span className="badge">{report.runs.length} runs</span></div>
      <div className="table-scroll"><table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Model</th>
            <th>Solved</th>
            <th>Score</th>
            <th>Solution mv</th>
            <th>Solver moves</th>
            <th>Elapsed (ms)</th>
          </tr>
        </thead>
        <tbody>
          {report.scores.map((s) => (
            <tr key={s.agentId}>
              <td>{s.agentId}</td>
              <td>{s.model}</td>
              <td>
                {s.solved}/{s.total}
              </td>
              <td>{s.score.toFixed(2)}</td>
              <td>
                {s.solutionMoveTurns > 0
                  ? `${((s.solutionMoveHits / s.solutionMoveTurns) * 100).toFixed(0)}% (${s.solutionMoveHits}/${s.solutionMoveTurns})`
                  : "—"}
              </td>
              <td>{s.totalSolverMoves}</td>
              <td>{s.totalElapsedMs}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <h3>Individual runs</h3>
      <div className="table-scroll"><table>
        <thead>
          <tr>
            <th>Challenge</th>
            <th>Agent</th>
            <th>Status</th>
            <th>Moves</th>
            <th>Elapsed (ms)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {report.runs.map((r) => (
            <tr key={r.id}>
              <td>{r.challengeId}</td>
              <td>{r.agentId}</td>
              <td><span className={`badge ${r.status === "solved" ? "success" : "danger"}`}>{r.status}</span>{r.failReason && <small className="run-reason">{r.failReason.replaceAll("_", " ")}</small>}</td>
              <td>{r.solverMoveCount}</td>
              <td>{r.elapsedMs ?? 0}</td>
              <td>
                <button type="button" onClick={() => onReplay(r)}>
                  Replay
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
