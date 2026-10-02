import { Move } from "../../engine/types.ts";

export function MoveHistory({ moves }: { moves: Move[] }): JSX.Element {
  if (moves.length === 0) return <p className="muted">No moves yet.</p>;
  return (
    <ol className="history">
      {moves.map((m) => (
        <li key={m.ply} className={m.rejected ? "rejected" : m.source}>
          <span className="ply">{m.ply}.</span>{" "}
          {m.rejected ? (
            <span>
              {m.side} tried {m.uci} — rejected ({m.rejected.reason})
            </span>
          ) : (
            <span>
              {m.side} {m.san} <span className="muted">({m.uci})</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
