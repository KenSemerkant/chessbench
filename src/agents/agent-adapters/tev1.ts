import { HttpProviderAgent, HttpProviderOptions } from "../shared/http-agent.ts";

export interface TevAgentOptions extends Omit<
  HttpProviderOptions,
  "provider" | "apiKeyEnv" | "endpointEnv"
> {
  apiKeyEnv?: string;
  endpointEnv?: string;
}

/**
 * Tev1 provider adapter: a local Ollama-fronted "System One" endpoint
 * (http://localhost:11434/v1/systemone). Like JEV it takes criteria as a
 * {label: description} dict and answers at answers.best_move.choice.
 *
 * The shim only serves local Nimble/Tev GGUF models and caps a choice question
 * at 26 candidates, so positions with more legal moves fail on the wire
 * (recorded as agent_error) rather than silently dropping options. Endpoint and
 * model come from TEV_ENDPOINT / TEV_MODEL; no credential is required.
 */
export class TevAgent extends HttpProviderAgent {
  protected requireApiKey = false;
  protected criteriaAsDict = true;

  constructor(options: TevAgentOptions) {
    super({
      ...options,
      provider: "tev",
      apiKeyEnv: options.apiKeyEnv ?? "TEV_API_KEY",
      endpointEnv: options.endpointEnv ?? "TEV_ENDPOINT",
    });
  }
}
