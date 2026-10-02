/**
 * Re-exports from the provider registry for backwards compatibility.
 * New code should import directly from "../registry.ts".
 */
export type { ProviderKey as RealProviderKind } from "../registry.ts";
export { defaultModel } from "../registry.ts";
