import { useCallback, useEffect, useRef, useState } from "react";
import { Challenge, ChallengeRun, SuiteResult } from "../../engine/types.ts";
import {
  BenchmarkHistory, SavedBenchmark, completeBenchmark, deleteBenchmark,
  loadBenchmarkHistory, saveBenchmarkHistory,
} from "../benchmark-storage.ts";
import { CompareView } from "./CompareView.tsx";
import { ReplayViewer } from "./ReplayViewer.tsx";
import { Results } from "./Results.tsx";
import { LiveBenchmark } from "./LiveBenchmark.tsx";

type Summary = Pick<Challenge, "id" | "title" | "mateInN" | "difficulty">;

interface AgentOffer {
  id: string;
  provider: string;
  model: string;
  available: boolean;
  reason: string | null;
}

interface BenchmarkViewProps {
  library: Summary[];
}

const POLL_MS = 1000;
/** Candidate cap for the "limit move choices" option (keeps the solution move). */
const CHOICE_LIMIT = 20;

/** Server-side suite benchmark across real providers. */
export function BenchmarkView({ library }: BenchmarkViewProps): JSX.Element {
  const [offers, setOffers] = useState<AgentOffer[]>([]);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [depthFilter, setDepthFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  // Filters define the candidate set; the benchmark runs every matching challenge
  // unless the user unchecks specific ones within the current filter view.
  const [excludedChallenges, setExcludedChallenges] = useState<string[]>([]);
  const [limitChoices, setLimitChoices] = useState(false);
  const visibleChallenges = library.filter((c) => (depthFilter === "all" || c.mateInN === Number(depthFilter)) && (difficultyFilter === "all" || c.difficulty === difficultyFilter));
  const selectedChallenges = visibleChallenges.filter((c) => !excludedChallenges.includes(c.id)).map((c) => c.id);
  const allMatchingSelected = visibleChallenges.length > 0 && selectedChallenges.length === visibleChallenges.length;
  const [initial] = useState(() => {
    try {
      return { history: loadBenchmarkHistory(window.localStorage), error: null };
    } catch (err) {
      return {
        history: { results: [], pending: null } as BenchmarkHistory,
        error: `Could not load saved benchmarks: ${(err as Error).message}`,
      };
    }
  });
  const [history, setHistory] = useState(initial.history);
  const historyRef = useRef(history);
  const [storageError, setStorageError] = useState<string | null>(initial.error);
  const [active, setActive] = useState<SavedBenchmark | null>(initial.history.results[0] ?? null);
  const report = active?.report ?? null;
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replay, setReplay] = useState<{ run: ChallengeRun; challenge: Challenge } | null>(null);
  const [compare, setCompare] = useState<[ChallengeRun, ChallengeRun] | null>(null);
  const [tab, setTab] = useState<"setup" | "watch" | "history">(initial.history.pending ? "watch" : "setup");
  const [liveRuns, setLiveRuns] = useState<ChallengeRun[]>([]);
  const [watchId, setWatchId] = useState<string | null>(initial.history.pending?.id ?? null);
  const watchSaved = history.results.find((entry) => entry.report.suiteId === watchId);
  const watchChallenges = history.pending?.challenges ?? watchSaved?.challenges ?? [];

  const persist = useCallback((next: BenchmarkHistory): void => {
    historyRef.current = next;
    setHistory(next);
    try {
      saveBenchmarkHistory(window.localStorage, next);
      setStorageError(null);
    } catch (err) {
      setStorageError(`Could not update browser storage: ${(err as Error).message}. These changes may be lost on refresh or navigation.`);
    }
  }, []);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => {
        if (!r.ok) throw new Error(`agents request failed (${r.status})`);
        return r.json();
      })
      .then((data: AgentOffer[]) => {
        setOffers(data);
        setSelectedAgents(data.filter((o) => o.available).map((o) => o.id).slice(0, 1));
      })
      .catch((err: Error) => setOffersError(err.message));
  }, []);

  useEffect(() => {
    const pending = history.pending;
    if (!pending) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/benchmarks/${pending.id}`);
        if (cancelled) return;
        if (res.status === 404) {
          setError("The pending benchmark is no longer on the server. Saved results are unaffected.");
          persist({ ...historyRef.current, pending: null });
          return;
        }
        if (!res.ok) throw new Error(`job request failed (${res.status})`);
        const job = (await res.json()) as {
          status: string;
          completedRuns: number;
          totalRuns: number;
          runs?: ChallengeRun[];
          report: SuiteResult | null;
          error: string | null;
        };
        if (cancelled) return;
        setError(null);
        setLiveRuns(job.runs ?? job.report?.runs ?? []);
        setProgress({ completed: job.completedRuns, total: job.totalRuns });
        if (job.status === "done" && job.report) {
          const saved = { report: job.report, challenges: pending.challenges };
          persist(completeBenchmark(historyRef.current, saved));
          setActive(saved);
        } else if (job.status === "error") {
          setError(job.error ?? "benchmark job failed");
          persist({ ...historyRef.current, pending: null });
        } else {
          timer = setTimeout(() => void poll(), POLL_MS);
        }
      } catch (err) {
        if (!cancelled) {
          setError(`${(err as Error).message}. Retrying; the pending benchmark is still saved.`);
          timer = setTimeout(() => void poll(), POLL_MS);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [history.pending, persist]);

  const toggle = (list: string[], id: string, set: (v: string[]) => void): void => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const toggleChallenge = (id: string): void => {
    setExcludedChallenges((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  };

  // "Select matching" clears exclusions for the filtered set; "Deselect matching" excludes it.
  const toggleMatching = (): void => {
    setExcludedChallenges((list) => allMatchingSelected
      ? [...new Set([...list, ...visibleChallenges.map((c) => c.id)])]
      : list.filter((id) => !visibleChallenges.some((c) => c.id === id)));
  };

  const runBenchmark = async (): Promise<void> => {
    setError(null);
    setStarting(true);
    setLiveRuns([]);
    setWatchId(null);
    setReplay(null);
    setCompare(null);
    setProgress({ completed: 0, total: selectedChallenges.length * selectedAgents.length });
    try {
      const challenges: Challenge[] = [];
      for (const id of selectedChallenges) {
        const res = await fetch(`/api/challenges/${id}`);
        if (!res.ok) throw new Error(`challenge "${id}" not found`);
        challenges.push((await res.json()) as Challenge);
      }
      const res = await fetch("/api/benchmarks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeIds: selectedChallenges,
          agents: selectedAgents.map((kind) => ({ kind })),
          ...(limitChoices ? { choiceLimit: CHOICE_LIMIT } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `benchmark start failed (${res.status})`);
      }
      const job = (await res.json()) as { id: string };
      persist({
        ...historyRef.current,
        pending: { id: job.id, challenges, totalRuns: challenges.length * selectedAgents.length },
      });
      setWatchId(job.id);
      setTab("watch");
    } catch (err) {
      setError((err as Error).message);
      setProgress(null);
    } finally {
      setStarting(false);
    }
  };

  const removeSaved = (suiteId: string): void => {
    if (!window.confirm("Delete this saved benchmark? This cannot be undone.")) return;
    const next = deleteBenchmark(historyRef.current, suiteId);
    persist(next);
    if (active?.report.suiteId === suiteId) setActive(next.results[0] ?? null);
    if (watchId === suiteId) { setWatchId(null); setLiveRuns([]); }
  };

  if (replay) {
    return <ReplayViewer challenge={replay.challenge} run={replay.run} onClose={() => setReplay(null)} />;
  }

  if (compare) {
    return <CompareView left={compare[0]} right={compare[1]} onClose={() => setCompare(null)} />;
  }

  const running = starting || history.pending !== null;

  return (
    <div className="benchmark">
      <div className="workspace-heading">
        <div><p className="eyebrow">The analysis studio</p><h1>Benchmark</h1></div>
        <nav className="subnav" aria-label="Benchmark views">
          <button type="button" aria-pressed={tab === "setup"} onClick={() => setTab("setup")}>Set up</button>
          <button type="button" aria-pressed={tab === "watch"} disabled={!watchId && !history.pending} onClick={() => setTab("watch")}>Watch{history.pending ? " · Live" : ""}</button>
          <button type="button" aria-pressed={tab === "history"} onClick={() => setTab("history")}>Results{history.results.length ? ` · ${history.results.length}` : ""}</button>
        </nav>
      </div>
      {storageError && <p className="error" role="alert">{storageError}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {tab === "watch" && (
        <LiveBenchmark key={watchId ?? history.pending?.id}
          runs={watchSaved?.report.runs ?? liveRuns} challenges={watchChallenges}
          totalRuns={history.pending?.totalRuns ?? watchSaved?.report.runs.length ?? 0}
          completedRuns={history.pending ? progress?.completed ?? 0 : watchSaved?.report.runs.length ?? 0}
          finished={Boolean(watchSaved)} onResults={() => { if (watchSaved) setActive(watchSaved); setTab("history"); }} />
      )}
      {tab === "history" && <section aria-labelledby="saved-benchmarks-heading">
        <h2 id="saved-benchmarks-heading">Saved benchmarks</h2>
        <p className="muted">Stored in this browser only. Open a result to replay or compare its runs.</p>
        {history.results.length === 0 ? (
          <p>No saved benchmarks yet. Completed benchmarks are saved automatically.</p>
        ) : (
          <ul className="saved-benchmarks">
            {history.results.map((saved) => (
              <li key={saved.report.suiteId}>
                <strong>{saved.report.suiteId}</strong>{" — "}
                <time dateTime={saved.report.ranAt}>{new Date(saved.report.ranAt).toLocaleString()}</time>
                <p className="muted">
                  {saved.report.scores.map((score) => `${score.agentId} (${score.model}): ${score.solved}/${score.total} solved`).join(" · ")}
                </p>
                <button
                  type="button"
                  aria-pressed={active?.report.suiteId === saved.report.suiteId}
                  onClick={() => { setActive(saved); setReplay(null); setCompare(null); }}
                >
                  Open results
                </button>{" "}
                <button type="button" disabled={Boolean(history.pending)} onClick={() => { setWatchId(saved.report.suiteId); setTab("watch"); }}>Watch playback</button>{" "}
                <button type="button" onClick={() => removeSaved(saved.report.suiteId)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>}
      {tab === "setup" && <section className="benchmark-setup">
      <div className="section-heading"><div><h2>Build your benchmark</h2><p className="muted">Same positions. Different minds. Select agents and challenges, then watch them play.</p></div></div>
      {offersError && <p className="error">{offersError}</p>}
      <div className="setup-grid"><div><h3>01 / Agents</h3>
      {offers.length === 0 && !offersError && <p>Loading agents…</p>}
      <ul className="checklist">
        {offers.map((o) => (
          <li key={o.id}>
            <label>
              <input
                type="checkbox"
                checked={selectedAgents.includes(o.id)}
                disabled={!o.available || running}
                onChange={() => toggle(selectedAgents, o.id, setSelectedAgents)}
              />
              {o.id} ({o.model})
              {!o.available && (
                <span className="muted"> — unavailable{o.reason ? `: ${o.reason}` : ""}</span>
              )}
            </label>
          </li>
        ))}
      </ul>
      </div><div><div className="section-heading compact"><h3>02 / Challenges</h3><button type="button" disabled={running || visibleChallenges.length === 0} onClick={toggleMatching}>{allMatchingSelected ? "Deselect matching" : "Select matching"}</button></div>
      <div className="library-filters">
        <label>Mate depth <select value={depthFilter} onChange={(event) => setDepthFilter(event.target.value)}><option value="all">All depths</option>{[1, 2, 3].map((n) => <option key={n} value={n}>Mate in {n}</option>)}</select></label>
        <label>Difficulty <select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)}><option value="all">All difficulties</option>{["easy", "medium", "hard"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <span className="muted">{selectedChallenges.length} of {visibleChallenges.length} matching selected</span>
      </div>
      <ul className="checklist challenge-checklist">
        {visibleChallenges.map((c) => (
          <li key={c.id}>
            <label>
              <input
                type="checkbox"
                checked={!excludedChallenges.includes(c.id)}
                disabled={running}
                onChange={() => toggleChallenge(c.id)}
              />
              {c.title} <span className="muted">Mate in {c.mateInN} · {c.difficulty}</span>
            </label>
          </li>
        ))}
      </ul>
      </div></div>
      <label className="benchmark-option">
        <input
          type="checkbox"
          checked={limitChoices}
          disabled={running}
          onChange={() => setLimitChoices((value) => !value)}
        />
        Limit move choices to {CHOICE_LIMIT} (keeps the solution move among the candidates)
      </label>
      <div className="setup-footer"><p className="muted">{selectedAgents.length} agents × {selectedChallenges.length} challenges · {selectedAgents.length * selectedChallenges.length} runs</p>
      <button
        className="primary"
        type="button"
        disabled={running || selectedAgents.length === 0 || selectedChallenges.length === 0}
        onClick={runBenchmark}
      >
        {running ? "Running…" : "Run benchmark"}
      </button></div>
      </section>}
      {running && tab !== "watch" && (
        <p role="status">
          {history.pending ? `Progress: ${progress?.completed ?? 0}/${history.pending.totalRuns} runs complete…` : "Starting benchmark…"}
        </p>
      )}
      {tab === "history" && report && (
        <>
          <Results
            report={report}
            onReplay={(run) => {
              const challenge = active?.challenges.find((c) => c.id === run.challengeId);
              if (challenge) setReplay({ run, challenge });
              else setError(`Starting position for "${run.challengeId}" is missing.`);
            }}
          />
          <h3>Side-by-side compare</h3>
          {report.challengeIds.map((cid) => {
            const runs = report.runs.filter((r) => r.challengeId === cid);
            if (runs.length < 2) return null;
            return (
              <p key={cid}>
                {cid}:{" "}
                <button type="button" onClick={() => setCompare([runs[0], runs[1]])}>
                  Compare {runs[0].agentId} vs {runs[1].agentId}
                </button>
              </p>
            );
          })}
        </>
      )}
    </div>
  );
}
