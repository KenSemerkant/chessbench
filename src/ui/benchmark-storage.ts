import { Challenge, ChallengeRun, SuiteResult } from "../engine/types.ts";

export const BENCHMARK_STORAGE_KEY = "chessbench.benchmarks.v1";

export interface SavedBenchmark {
  report: SuiteResult;
  challenges: Challenge[];
}

export interface PendingBenchmark {
  id: string;
  challenges: Challenge[];
  totalRuns: number;
}

export interface BenchmarkHistory {
  results: SavedBenchmark[];
  pending: PendingBenchmark | null;
}

type StorageAccess = Pick<Storage, "getItem" | "setItem">;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

function isChallenge(value: unknown): value is Challenge {
  return object(value) && typeof value.id === "string" && typeof value.title === "string" &&
    typeof value.fen === "string" && value.fen.split(" ").length === 6 &&
    (value.sideToMove === "white" || value.sideToMove === "black") &&
    typeof value.mateInN === "number" && strings(value.tags) &&
    ["easy", "medium", "hard"].includes(String(value.difficulty));
}

function isRun(value: unknown): value is ChallengeRun {
  return object(value) && typeof value.id === "string" && typeof value.challengeId === "string" &&
    typeof value.agentId === "string" && typeof value.startedAt === "string" &&
    ["solved", "failed", "in_progress"].includes(String(value.status)) &&
    typeof value.solverMoveCount === "number" && Array.isArray(value.moves) &&
    value.moves.every((move) => object(move) && typeof move.uci === "string" &&
      typeof move.san === "string" && typeof move.resultingFen === "string" &&
      typeof move.ply === "number" && typeof move.atMs === "number" &&
      (move.side === "white" || move.side === "black") &&
      (move.source === "solver" || move.source === "defender") &&
      (move.rejected === undefined || (object(move.rejected) &&
        typeof move.rejected.reason === "string" && typeof move.rejected.detail === "string")));
}

function isSaved(value: unknown): value is SavedBenchmark {
  if (!object(value) || !object(value.report) || !Array.isArray(value.challenges) ||
    !value.challenges.every(isChallenge)) return false;
  const report = value.report;
  const challenges = value.challenges;
  const challengeIds = report.challengeIds;
  return typeof report.suiteId === "string" && typeof report.ranAt === "string" &&
    strings(challengeIds) && strings(report.agentIds) &&
    Array.isArray(report.runs) && report.runs.every(isRun) &&
    Array.isArray(report.scores) && report.scores.every((score) => object(score) &&
      typeof score.agentId === "string" && typeof score.model === "string" &&
      ["solved", "total", "score", "totalSolverMoves", "totalElapsedMs"].every(
        (key) => typeof score[key] === "number" && Number.isFinite(score[key]),
      )) && challengeIds.every((id) => challenges.some((c) => c.id === id)) &&
    report.runs.every((run) => challengeIds.includes(run.challengeId));
}

export function loadBenchmarkHistory(storage: StorageAccess): BenchmarkHistory {
  const raw = storage.getItem(BENCHMARK_STORAGE_KEY);
  if (raw === null) return { results: [], pending: null };
  const value: unknown = JSON.parse(raw);
  if (!object(value) || value.version !== 1 || !Array.isArray(value.results) ||
    !value.results.every(isSaved) ||
    !(value.pending === null || (object(value.pending) && typeof value.pending.id === "string" &&
      typeof value.pending.totalRuns === "number" && Array.isArray(value.pending.challenges) &&
      value.pending.challenges.every(isChallenge)))) {
    throw new Error("Saved benchmark data is invalid or uses an unsupported version.");
  }
  return { results: value.results, pending: value.pending as PendingBenchmark | null };
}

export function saveBenchmarkHistory(storage: StorageAccess, history: BenchmarkHistory): void {
  storage.setItem(BENCHMARK_STORAGE_KEY, JSON.stringify({ version: 1, ...history }));
}

export function completeBenchmark(history: BenchmarkHistory, saved: SavedBenchmark): BenchmarkHistory {
  return {
    results: [saved, ...history.results.filter((entry) => entry.report.suiteId !== saved.report.suiteId)],
    pending: null,
  };
}

export function deleteBenchmark(history: BenchmarkHistory, suiteId: string): BenchmarkHistory {
  return { ...history, results: history.results.filter((entry) => entry.report.suiteId !== suiteId) };
}
