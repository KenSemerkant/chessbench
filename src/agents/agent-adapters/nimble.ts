import { HttpProviderAgent, HttpProviderOptions } from "../shared/http-agent.ts";

export interface NimbleAgentOptions extends Omit<
  HttpProviderOptions,
  "provider" | "apiKeyEnv" | "endpointEnv"
> {
  apiKeyEnv?: string;
  endpointEnv?: string;
}

/**
 * Nimble provider adapter: a local Ollama-fronted "System One" endpoint
 * (http://localhost:11434/v1/systemone). Like JEV it takes criteria as a
 * {label: description} dict and answers at answers.best_move.choice.
 *
 * The shim only serves local Nimble/Tev GGUF models and caps a choice question
 * at 26 candidates, so positions with more legal moves fail on the wire
 * (recorded as agent_error) rather than silently dropping options. Endpoint and
 * model come from NIMBLE_ENDPOINT / NIMBLE_MODEL; no credential is required.
 */
export class NimbleAgent extends HttpProviderAgent {
  protected requireApiKey = false;
  protected criteriaAsDict = true;

  constructor(options: NimbleAgentOptions) {
    super({
      ...options,
      provider: "nimble",
      apiKeyEnv: options.apiKeyEnv ?? "NIMBLE_API_KEY",
      endpointEnv: options.endpointEnv ?? "NIMBLE_ENDPOINT",
    });
  }
}
