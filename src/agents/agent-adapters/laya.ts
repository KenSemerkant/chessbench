import { HttpProviderAgent, HttpProviderOptions } from "../shared/http-agent.ts";

export interface LayaAgentOptions extends Omit<
  HttpProviderOptions,
  "provider" | "apiKeyEnv" | "endpointEnv"
> {
  apiKeyEnv?: string;
  endpointEnv?: string;
}

/**
 * Laya provider adapter. Local SystemOne servers need no API key (only the
 * endpoint is required). Laya speaks the shared reasoning protocol verbatim:
 * SAN-label criteria, answers at `answers.best_move.choice`.
 */
export class LayaAgent extends HttpProviderAgent {
  protected requireApiKey = false;

  constructor(options: LayaAgentOptions) {
    super({
      ...options,
      provider: "laya",
      apiKeyEnv: options.apiKeyEnv ?? "LAYA_API_KEY",
      endpointEnv: options.endpointEnv ?? "LAYA_ENDPOINT",
    });
  }
}
