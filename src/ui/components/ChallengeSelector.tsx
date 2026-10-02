import { useState } from "react";
import { Challenge } from "../../engine/types.ts";

interface SelectorProps {
  entries: Array<Pick<Challenge, "id" | "title" | "mateInN" | "difficulty" | "tags">>;
  loaded: boolean;
  error: string | null;
  onSelect: (id: string) => void;
}

export function ChallengeSelector({ entries, loaded, error, onSelect }: SelectorProps): JSX.Element {
  const [depth, setDepth] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const visible = entries.filter((c) => (depth === "all" || c.mateInN === Number(depth)) && (difficulty === "all" || c.difficulty === difficulty));
  return (
    <div className="selector">
      <div className="library-heading"><p className="eyebrow">Your move</p><h1>Find the finish.</h1>
      <p className="intro">A collection of forced-mate positions. Take the board yourself, or put an agent’s reasoning to the test.</p></div>
      <div className="section-heading"><h2>Challenge library</h2><span className="muted">{entries.length} positions</span></div>
      {error && <p className="error">{error}</p>}
      {!loaded && !error && <p>Loading challenges…</p>}
      {loaded && entries.length === 0 && !error && (
        <p>No challenges found in the library. Add puzzle JSON files to the challenges/ directory.</p>
      )}
      <div className="library-filters">
        <label>Mate depth <select value={depth} onChange={(event) => setDepth(event.target.value)}><option value="all">All depths</option>{[1, 2, 3].map((n) => <option key={n} value={n}>Mate in {n}</option>)}</select></label>
        <label>Difficulty <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="all">All difficulties</option>{["easy", "medium", "hard"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <span className="muted">{visible.length} matching positions</span>
      </div>
      <ul>
        {visible.map((c, index) => (
          <li key={c.id}>
            <button type="button" onClick={() => onSelect(c.id)}>
              <span className="challenge-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="challenge-copy"><strong>{c.title}</strong><span className="meta">Mate in {c.mateInN} · {c.tags.filter((tag) => !tag.startsWith("mate")).join(" / ").replaceAll("-", " ")}</span></span>
              <span className={`badge difficulty-${c.difficulty}`}>{c.difficulty}</span>
              <span className="challenge-arrow" aria-hidden="true">↗</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
