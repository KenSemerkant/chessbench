/** Provider-agnostic agent contract (contracts/agent-interface.md). */
import { ChoiceQuestion } from "./reasoning.ts";

export type Provider = "jev" | "laya" | "nimble" | "tev" | "mock";

export interface ChallengeState {
  challengeId: string;
  /** Current position, full FEN — always the solver's turn. */
  fen: string;
  sideToMove: "white" | "black";
  mateInN: number;
  solverMovesUsed: number;
  movesRemaining: number;
  /** UCI plies applied this run, in order. */
  history: string[];
  /** Solver's legal UCI options in the current position. */
  legalMoves: string[];
  /**
   * When set, the adapter presents at most this many candidate moves in the
   * choice question (only honored alongside a legal `correctMove`).
   */
  choiceLimit?: number;
  /** Proven winning move for this turn (UCI); kept among the candidates. */
  correctMove?: string;
}

export interface AgentMove {
  /** Raw UCI string; the engine validates everything. */
  uci: string;
  /** Raw per-turn Q&A supplied by structured-protocol adapters; absent otherwise. */
  reasoning?: { question: ChoiceQuestion; answer: unknown };
}

export type Availability = { ok: true } | { ok: false; reason: string };

export interface Agent {
  readonly id: string;
  readonly name: string;
  readonly provider: Provider;
  readonly model: string;
  readonly timeoutMs: number;
  /** Resolve availability at startup (e.g., credential present). */
  checkAvailability(): Promise<Availability>;
  /** Return the solver's next move. MUST NOT validate legality. */
  requestMove(state: ChallengeState): Promise<AgentMove>;
}
