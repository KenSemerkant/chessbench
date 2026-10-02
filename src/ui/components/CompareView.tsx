import { ChallengeRun } from "../../engine/types.ts";

interface CompareViewProps {
  left: ChallengeRun;
  right: ChallengeRun;
  onClose: () => void;
}

/** Two runs of the same challenge, move sequences aligned ply-by-ply. */
export function CompareView({ left, right, onClose }: CompareViewProps): JSX.Element {
  const a = left.moves.filter((m) => !m.rejected);
  const b = right.moves.filter((m) => !m.rejected);
  const rows = Math.max(a.length, b.length);
  let divergence: number | null = null;
  for (let i = 0; i < rows; i++) {
    if (a[i]?.uci !== b[i]?.uci) {
      divergence = i + 1;
      break;
    }
  }

  const cell = (m: (typeof a)[number] | undefined) =>
    m ? `${m.san} (${m.uci})` : "—";

  return (
    <div className="compare">
      <h2>
        Compare — {left.challengeId}: {left.agentId} vs {right.agentId}
      </h2>
      {divergence !== null && <p>Runs diverge at ply {divergence}.</p>}
      {divergence === null && <p>Runs are move-identical.</p>}
      <table>
        <thead>
          <tr>
            <th>Ply</th>
            <th>
              {left.agentId} ({left.status})
            </th>
            <th>
              {right.agentId} ({right.status})
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i + 1} className={divergence === i + 1 ? "diverged" : ""}>
              <td>{i + 1}</td>
              <td>{cell(a[i])}</td>
              <td>{cell(b[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
