import { buildBestMoveQuestion, legalMovesWithDescriptions } from "../../src/agents/protocol/reasoning.ts";
import { Agent, AgentMove, Availability, ChallengeState, Provider } from "../../src/agents/protocol/types.ts";

export interface MockAgentOptions {
  id: string;
  name?: string;
  model?: string;
  /** UCI replies indexed by solverMovesUsed; exhausted script throws. */
  script: string[];
  /** Per-challenge scripts, selected by ChallengeState.challengeId. */
  scripts?: Record<string, string[]>;
  /**
   * Structured-answer fixture mode: replies carry a Q&A payload shaped like
   * a real reasoning answer (`{best_move: uci}`), for offline protocol runs.
   */
  structured?: boolean;
  /** Simulated latency per move (for timeout tests). */
  delayMs?: number;
  timeoutMs?: number;
}

/**
 * Deterministic test-only agent for hermetic runner and protocol tests.
 */
export class MockAgent implements Agent {
  readonly id: string;
  readonly name: string;
  readonly provider: Provider = "mock";
  readonly model: string;
  readonly timeoutMs: number;
  private readonly script: string[];
  private readonly scripts?: Record<string, string[]>;
  private readonly structured: boolean;
  private readonly delayMs: number;

  constructor(options: MockAgentOptions) {
    this.id = options.id;
    this.name = options.name ?? options.id;
    this.model = options.model ?? "mock-scripted";
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.script = [...options.script];
    this.scripts = options.scripts;
    this.structured = options.structured ?? false;
    this.delayMs = options.delayMs ?? 0;
  }

  async checkAvailability(): Promise<Availability> {
    return { ok: true };
  }

  async requestMove(state: ChallengeState): Promise<AgentMove> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    const script = this.scripts?.[state.challengeId] ?? this.script;
    const uci = script[state.solverMovesUsed];
    if (uci === undefined) {
      throw new Error(`mock script exhausted after ${script.length} move(s)`);
    }
    if (!this.structured) return { uci };
    const question = buildBestMoveQuestion(state.fen);
    const choice =
      legalMovesWithDescriptions(state.fen).find((m) => m.uci === uci)?.san ?? uci;
    return { uci, reasoning: { question, answer: { answers: { best_move: { choice } } } } };
  }
}
