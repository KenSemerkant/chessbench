/**
 * Provider registry — the single place to add a new agent.
 *
 * To add a provider:
 *   1. Add a record here.
 *   2. Add it to protocol/types.ts Provider union.
 *   That's it — CLI, server, and defaults all derive from this map.
 */
import { HttpProviderAgent, HttpProviderOptions } from "./shared/http-agent.ts";

export interface ProviderConfig {
  /** Display name (falls back to key if omitted). */
  name?: string;
  /** Env var for the API key. Set requireApiKey false for keyless endpoints. */
  apiKeyEnv: string;
  /** Env var for the endpoint URL. */
  endpointEnv: string;
  /** Env var for model override, e.g. "JEV_MODEL". */
  modelEnv: string;
  /** Fallback model id when the env var is unset. */
  defaultModel: string;
  /** false → skip API-key requirement (local/keyless servers). Default: true. */
  requireApiKey?: boolean;
  /** true → send criteria as a {label: description} dict instead of an array. */
  criteriaAsDict?: boolean;
}

/** All registered providers. Add one record here to register a new provider. */
export const PROVIDER_REGISTRY = {
  jev: {
    apiKeyEnv: "JEV_API_KEY",
    endpointEnv: "JEV_ENDPOINT",
    modelEnv: "JEV_MODEL",
    defaultModel: "jev-latest",
    requireApiKey: true,
    criteriaAsDict: true,
  },
  laya: {
    apiKeyEnv: "LAYA_API_KEY",
    endpointEnv: "LAYA_ENDPOINT",
    modelEnv: "LAYA_MODEL",
    defaultModel: "laya-latest",
    requireApiKey: false,
    criteriaAsDict: false,
  },
  nimble: {
    apiKeyEnv: "NIMBLE_API_KEY",
    endpointEnv: "NIMBLE_ENDPOINT",
    modelEnv: "NIMBLE_MODEL",
    defaultModel: "nimble",
    requireApiKey: false,
    criteriaAsDict: true,
  },
  tev: {
    apiKeyEnv: "TEV_API_KEY",
    endpointEnv: "TEV_ENDPOINT",
    modelEnv: "TEV_MODEL",
    defaultModel: "tev1:0.8b",
    requireApiKey: false,
    criteriaAsDict: true,
  },
} as const satisfies Record<string, ProviderConfig>;

export type ProviderKey = keyof typeof PROVIDER_REGISTRY;

export const PROVIDER_KEYS = Object.keys(PROVIDER_REGISTRY) as ProviderKey[];

/** Resolve the default model for a provider, respecting the env override. */
export function defaultModel(kind: ProviderKey): string {
  const cfg = PROVIDER_REGISTRY[kind];
  return process.env[cfg.modelEnv] ?? cfg.defaultModel;
}

/** Returns true when `value` is a registered provider key. */
export function isProviderKey(value: unknown): value is ProviderKey {
  return typeof value === "string" && value in PROVIDER_REGISTRY;
}

/**
 * Create a configured `HttpProviderAgent` for a provider from the registry.
 * The adapter class files are no longer needed for construction; they exist only
 * if a provider needs to override request/response behaviour beyond the flags.
 */
export function createAgent(
  kind: ProviderKey,
  options: Omit<HttpProviderOptions, "provider" | "apiKeyEnv" | "endpointEnv"> & { model?: string },
): HttpProviderAgent {
  const cfg = PROVIDER_REGISTRY[kind];

  // Inline subclass applies the per-provider flags without requiring a separate file.
  class RegistryAgent extends HttpProviderAgent {
    protected override requireApiKey = cfg.requireApiKey ?? true;
    protected override criteriaAsDict = cfg.criteriaAsDict ?? false;
  }

  return new RegistryAgent({
    ...options,
    model: options.model ?? defaultModel(kind),
    provider: kind,
    apiKeyEnv: cfg.apiKeyEnv,
    endpointEnv: cfg.endpointEnv,
  });
}
