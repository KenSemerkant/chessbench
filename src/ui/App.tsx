import { ReactNode, useCallback, useEffect, useState } from "react";
import type * as cg from "@lichess-org/chessground/types";
import { EngineRun } from "../engine/run.ts";
import { Snapshot } from "../engine/run.ts";
import { Challenge } from "../engine/types.ts";
import { destsFromUci, legalUciMoves } from "../engine/moves.ts";
import { Board, BoardView } from "./components/Board.tsx";
import { BenchmarkView } from "./components/BenchmarkView.tsx";
import { ChallengeSelector } from "./components/ChallengeSelector.tsx";
import { MoveHistory } from "./components/MoveHistory.tsx";
import { PromotionPicker } from "./components/PromotionPicker.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { TraceView } from "./components/TraceView.tsx";
import { needsPromotionChoice, turnFromFen } from "./fen.ts";
import { inCheckFromFen } from "./fen-check.ts";

type Summary = Pick<Challenge, "id" | "title" | "mateInN" | "difficulty" | "tags">;

function AppShell({ mode, onNavigate, children }: { mode: "play" | "benchmark"; onNavigate: (mode: "play" | "benchmark") => void; children: ReactNode }): JSX.Element {
  return (
    <div className="app">
      <header className="app-header">
        <a className="wordmark" href="#" onClick={(event) => { event.preventDefault(); onNavigate("play"); }}>
          <span className="brand-mark" aria-hidden="true">♞</span> ChessBench<span className="brand-caption">CHESS / INTELLIGENCE</span>
        </a>
        <nav className="tabs" aria-label="Main navigation">
          <button type="button" className={mode === "play" ? "active" : ""} aria-current={mode === "play" ? "page" : undefined} onClick={() => onNavigate("play")}>Play</button>
          <button type="button" className={mode === "benchmark" ? "active" : ""} aria-current={mode === "benchmark" ? "page" : undefined} onClick={() => onNavigate("benchmark")}>Benchmark</button>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="app-footer">Forced mates. Measured intelligence.<span>ChessBench Studio</span></footer>
    </div>
  );
}

export function App(): JSX.Element {
  const [mode, setMode] = useState<"play" | "benchmark">("play");
  const [library, setLibrary] = useState<Summary[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [run, setRun] = useState<EngineRun | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ orig: string; dest: string } | null>(
    null,
  );

  useEffect(() => {
    fetch("/api/challenges")
      .then((r) => {
        if (!r.ok) throw new Error(`library request failed (${r.status})`);
        return r.json();
      })
      .then((entries: Summary[]) => {
        setLibrary(entries);
        setLibraryLoaded(true);
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  const selectChallenge = useCallback(async (id: string) => {
    setLoadError(null);
    setMessage(null);
    setPendingPromotion(null);
    try {
      const res = await fetch(`/api/challenges/${id}`);
      if (!res.ok) throw new Error(`challenge "${id}" not found`);
      const loaded: Challenge = await res.json();
      const next = new EngineRun(loaded, "human");
      setChallenge(loaded);
      setRun(next);
      setSnap(next.snapshot());
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, []);

  const submitUci = useCallback(
    (uci: string) => {
      if (!run) return;
      const res = run.applySolverMove(uci);
      setSnap(run.snapshot());
      if (!res.appliedMove) {
        const attempt = run.snapshot().moves.at(-1);
        setMessage(
          `Illegal move — board unchanged (${attempt?.rejected?.reason ?? "rejected"}: ${attempt?.rejected?.detail ?? uci}).`,
        );
      } else {
        setMessage(null);
      }
    },
    [run],
  );

  /** Restart the current challenge from its starting position (fresh engine run). */
  const resetChallenge = useCallback(() => {
    if (!challenge) return;
    const next = new EngineRun(challenge, "human");
    setRun(next);
    setSnap(next.snapshot());
    setMessage(null);
    setPendingPromotion(null);
  }, [challenge]);

  const handleBoardMove = useCallback(
    (orig: string, dest: string) => {
      if (!snap || snap.status !== "in_progress") return;
      if (needsPromotionChoice(snap.fen, orig, dest)) {
        setPendingPromotion({ orig, dest });
        return;
      }
      submitUci(orig + dest);
    },
    [snap, submitUci],
  );

  if (mode === "benchmark") {
    return <AppShell mode={mode} onNavigate={setMode}><BenchmarkView library={library} /></AppShell>;
  }

  if (!challenge || !run || !snap) {
    return (
      <AppShell mode={mode} onNavigate={setMode}>
        <ChallengeSelector entries={library} loaded={libraryLoaded} error={loadError} onSelect={selectChallenge} />
      </AppShell>
    );
  }

  const turn = turnFromFen(snap.fen);
  const solverTurn = turn === challenge.sideToMove;
  const interactive = snap.status === "in_progress" && solverTurn && pendingPromotion === null;
  const last = snap.moves.filter((m) => !m.rejected).at(-1);
  const view: BoardView = {
    fen: snap.fen,
    turnColor: turn as cg.Color,
    check: inCheckFromFen(snap.fen),
    lastMove: last ? [last.uci.slice(0, 2), last.uci.slice(2, 4)] : null,
    dests: interactive ? destsFromUci(legalUciMoves(snap.fen)) : new Map(),
    orientation: challenge.sideToMove as cg.Color,
  };

  return (
    <AppShell mode={mode} onNavigate={setMode}>
      <StatusBar
        challenge={challenge}
        solverMoveCount={snap.solverMoveCount}
        status={snap.status}
        failReason={snap.failReason}
        inCheck={view.check}
        onReset={resetChallenge}
        onExit={() => {
          setChallenge(null);
          setRun(null);
          setSnap(null);
          setMessage(null);
        }}
      />
      {message && <p className="error">{message}</p>}
      <div className="play-area studio-grid">
        <div className="board-stage"><Board view={view} interactive={interactive} onMove={handleBoardMove} /></div>
        <div className="side analysis-panel">
          <h3>Moves</h3>
          <MoveHistory moves={snap.moves} />
          {snap.status !== "in_progress" && (
            <TraceView
              run={{
                id: "live",
                challengeId: challenge.id,
                agentId: "human",
                startedAt: "",
                status: snap.status,
                failReason: snap.failReason,
                solverMoveCount: snap.solverMoveCount,
                moves: snap.moves,
              }}
            />
          )}
        </div>
      </div>
      {pendingPromotion && (
        <PromotionPicker
          mover={challenge.sideToMove}
          onChoose={(piece) => {
            const { orig, dest } = pendingPromotion;
            setPendingPromotion(null);
            submitUci(orig + dest + piece);
          }}
          onCancel={() => {
            // Re-sync board from engine state, discarding the visual move.
            setPendingPromotion(null);
            setSnap(run.snapshot());
          }}
        />
      )}
    </AppShell>
  );
}
