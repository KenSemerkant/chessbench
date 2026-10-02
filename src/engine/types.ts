/** Shared domain types. The engine owns these; agents/UI/benchmark depend on them. */

export type Color = "white" | "black";

export type MoveSource = "solver" | "defender";

export type FailReason =
  | "budget_exhausted"
  | "illegal_move"
  | "malformed_move"
  | "timeout"
  | "stalemate"
  | "dead_position"
  | "agent_error"
  | "agent_unavailable";

export type RunStatus = "in_progress" | "solved" | "failed";

export type Difficulty = "easy" | "medium" | "hard";

export interface Challenge {
  id: string;
  title: string;
  description?: string;
  fen: string;
  sideToMove: Color;
  mateInN: number;
  difficulty: Difficulty;
  tags: string[];
  source?: {
    provider: "lichess";
    puzzleId: string;
    url: string;
    gameUrl: string;
    rating: number;
    license: "CC0-1.0";
  };
  /**
   * Proven solver UCI moves for the deterministic defender line (one per
   * solver turn, so length === mateInN). Curation data: lets a benchmark keep
   * the winning move among a limited candidate set. Absent for fixtures.
   */
  solution?: string[];
}

export interface RejectedMoveInfo {
  reason: Extract<FailReason, "illegal_move" | "malformed_move">;
  detail: string;
}

export interface Move {
  ply: number;
  side: Color;
  source: MoveSource;
  uci: string;
  san: string;
  resultingFen: string;
  atMs: number;
  rejected?: RejectedMoveInfo;
  /**
   * Opaque per-turn provider Q&A attached by the agent layer (FR-013 of the
   * reasoning feature). The engine never inspects it — kept as unknown to
   * preserve the engine's independence from provider protocols.
   */
  reasoning?: { question: unknown; answer: unknown };
}

export interface ChallengeRun {
  id: string;
  challengeId: string;
  agentId: string;
  model?: string;
  startedAt: string;
  endedAt?: string;
  status: RunStatus;
  failReason: FailReason | null;
  solverMoveCount: number;
  moves: Move[];
  elapsedMs?: number;
  /** Human-readable detail for failed runs (never contains secrets). */
  error?: string;
}

export interface PerAgentScore {
  agentId: string;
  model: string;
  solved: number;
  total: number;
  score: number;
  totalSolverMoves: number;
  totalElapsedMs: number;
}

export interface SuiteResult {
  suiteId: string;
  ranAt: string;
  challengeIds: string[];
  agentIds: string[];
  runs: ChallengeRun[];
  scores: PerAgentScore[];
}

/** Thrown when a challenge definition or id cannot be used. Names file + field + reason. */
export class ChallengeLoadError extends Error {
  readonly file: string;
  readonly field: string;
  readonly reason: string;

  constructor(file: string, field: string, reason: string) {
    super(`Invalid challenge ${file}: field "${field}": ${reason}`);
    this.name = "ChallengeLoadError";
    this.file = file;
    this.field = field;
    this.reason = reason;
  }
}
