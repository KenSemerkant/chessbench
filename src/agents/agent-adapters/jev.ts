import { HttpProviderAgent, HttpProviderOptions } from "../shared/http-agent.ts";

export interface JevAgentOptions extends Omit<
  HttpProviderOptions,
  "provider" | "apiKeyEnv" | "endpointEnv"
> {
  apiKeyEnv?: string;
  endpointEnv?: string;
}

/**
 * JEV provider adapter (TypeSafe SystemOne). JEV's ChoiceQuestion takes
 * criteria as a `{label: description}` dict; labels are SAN strings and the
 * answer arrives at `answers.best_move.choice`. Credentials + endpoint from
 * JEV_API_KEY / JEV_ENDPOINT.
 */
export class JevAgent extends HttpProviderAgent {
  protected criteriaAsDict = true;

  constructor(options: JevAgentOptions) {
    super({
      ...options,
      provider: "jev",
      apiKeyEnv: options.apiKeyEnv ?? "JEV_API_KEY",
      endpointEnv: options.endpointEnv ?? "JEV_ENDPOINT",
    });
  }
}
