import {
  ChoiceQuestion,
  buildReasoningRequest,
  legalMovesWithDescriptions,
  parseStructuredAnswer,
  selectChoices,
} from "../protocol/reasoning.ts";
import { Agent, AgentMove, Availability, ChallengeState, Provider } from "../protocol/types.ts";

/** Per-request parse context threading builder output into answer parsing. */
export interface RequestContext {
  question: ChoiceQuestion;
  /** Canonical legal moves for mapping the answered SAN label back to UCI. */
  moves: Array<{ uci: string; san: string }>;
}

export interface HttpProviderOptions {
  id: string;
  name?: string;
  provider: Exclude<Provider, "mock">;
  model: string;
  /** Env var holding the API key (never logged or recorded). */
  apiKeyEnv: string;
  /** Env var holding the full HTTPS endpoint URL (deployment-provided). */
  endpointEnv: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Shared HTTP adapter core. Concrete providers supply only identity +
 * env names; the engine still validates every returned move. Both the API
 * key and the endpoint URL come from the environment — nothing provider
 * specific is hardcoded (FR-024) and nothing secret is stored (FR-024a).
 */
export abstract class HttpProviderAgent implements Agent {
  readonly id: string;
  readonly name: string;
  readonly provider: Exclude<Provider, "mock">;
  readonly model: string;
  readonly timeoutMs: number;
  protected readonly apiKeyEnv: string;
  protected readonly endpointEnv: string;
  protected readonly fetchImpl: typeof fetch;
  /** Override to false for keyless endpoints (e.g. local servers). */
  protected requireApiKey = true;
  /** Override to true when choice criteria must be a {label: description} dict. */
  protected criteriaAsDict = false;

  constructor(options: HttpProviderOptions) {
    this.id = options.id;
    this.name = options.name ?? options.id;
    this.provider = options.provider;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.apiKeyEnv = options.apiKeyEnv;
    this.endpointEnv = options.endpointEnv;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async checkAvailability(): Promise<Availability> {
    if (this.requireApiKey && !process.env[this.apiKeyEnv]) {
      return { ok: false, reason: `missing ${this.apiKeyEnv}` };
    }
    if (!process.env[this.endpointEnv]) {
      return { ok: false, reason: `missing ${this.endpointEnv}` };
    }
    return { ok: true };
  }

  /** Build the wire body; default is the shared reasoning request verbatim. */
  protected buildRequestBody(state: ChallengeState): { body: unknown; context: RequestContext } {
    const request = buildReasoningRequest(state, this.model);
    const moves = legalMovesWithDescriptions(state.fen);
    let question = request.questions.best_move;
    // Bounded choice head: present at most `choiceLimit` candidates, always
    // keeping the proven move when it is legal here. Off the solution line the
    // anchor may be unavailable, but the cap still applies so a bounded server
    // (e.g. Nimble's 26-option limit) never rejects the request.
    if (state.choiceLimit !== undefined && moves.length > state.choiceLimit) {
      question = { ...question, criteria: selectChoices(moves, state.choiceLimit, state.correctMove).map((m) => m.san) };
    }
    const context: RequestContext = { question, moves };
    if (!this.criteriaAsDict) {
      return { body: { ...request, questions: { best_move: question } }, context };
    }
    const criteria: Record<string, string> = Object.fromEntries(
      question.criteria.map((label) => [label, label]),
    );
    return {
      body: { ...request, questions: { best_move: { ...question, criteria } } },
      context,
    };
  }

  /** Extract the solver move from the wire response; default is named-answer parse. */
  protected parseResponseBody(
    text: string,
    context: RequestContext,
  ): { uci: string; answer: unknown } {
    let payload: unknown = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    const selected = payload !== null ? parseStructuredAnswer(payload, context.moves) : null;
    return { uci: selected ?? "", answer: payload !== null ? payload : text };
  }

  async requestMove(state: ChallengeState): Promise<AgentMove> {
    const apiKey = process.env[this.apiKeyEnv] ?? "";
    const endpoint = process.env[this.endpointEnv];
    if ((this.requireApiKey && !apiKey) || !endpoint) {
      throw new Error(`provider not configured (missing ${this.apiKeyEnv} or ${this.endpointEnv})`);
    }
    const { body, context } = this.buildRequestBody(state);
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`provider responded with HTTP ${response.status}`);
    }
    const { uci, answer } = this.parseResponseBody(await response.text(), context);
    // Empty UCI ⇒ the engine records malformed_move (never throws here).
    return { uci, reasoning: { question: context.question, answer } };
  }
}
