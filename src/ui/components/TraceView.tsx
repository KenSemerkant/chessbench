import { ChallengeRun } from "../../engine/types.ts";

/**
 * The ply where the solution was lost: the rejected attempt when present,
 * otherwise the last solver-sourced move of a failed run. Null for
 * in-progress or solved runs.
 */
export function failingPly(run: ChallengeRun): number | null {
  if (run.status !== "failed") return null;
  const rejected = run.moves.find((m) => m.rejected);
  if (rejected) return rejected.ply;
  const solverMoves = run.moves.filter((m) => m.source === "solver");
  return solverMoves.length > 0 ? solverMoves.at(-1)!.ply : null;
}

/** Read-only one-liner for a recorded per-turn Q&A payload. */
function reasoningLabel(reasoning: { question: unknown; answer: unknown }): string {
  const name =
    typeof reasoning.question === "object" && reasoning.question !== null
      ? String((reasoning.question as Record<string, unknown>).name ?? "question")
      : "question";
  return `asked ${name}, answered ${JSON.stringify(reasoning.answer)}`;
}

export function TraceView({ run }: { run: ChallengeRun }): JSX.Element {
  const lostAt = failingPly(run);
  return (
    <div className="trace">
      <h3>
        Decision trace — {run.agentId} · {run.status}
        {run.failReason ? ` (${run.failReason})` : ""}
      </h3>
      {lostAt !== null && <p className="failed">Solution lost at ply {lostAt}.</p>}
      <ol className="history">
        {run.moves.map((m) => (
          <li
            key={m.ply}
            className={[m.rejected ? "rejected" : m.source, m.ply === lostAt ? "lost" : ""]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="ply">{m.ply}.</span>{" "}
            {m.rejected ? (
              <span>
                {m.side} tried {m.uci} — rejected ({m.rejected.reason})
              </span>
            ) : (
              <span>
                {m.side} ({m.source}) {m.san} <span className="muted">({m.uci})</span>
                {m.reasoning ? (
                  <span className="muted"> · {reasoningLabel(m.reasoning)}</span>
                ) : null}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
