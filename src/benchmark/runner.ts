import { runAgentChallenge } from "../agents/runner.ts";
import { Agent } from "../agents/protocol/types.ts";
import { Challenge, ChallengeRun, SuiteResult } from "../engine/types.ts";
import { scoreAgents } from "./scoring.ts";

export interface SuiteOptions {
  suiteId: string;
  /** Challenges to run, in execution order (load via loadLibrary in node). */
  challenges: Challenge[];
  agents: Agent[];
  /** Progress callback after each completed (challenge × agent) run. */
  onProgress?: (completed: number, total: number) => void;
  onRunUpdate?: (run: ChallengeRun) => void;
  /** Cap the candidate moves offered each turn (keeps the proven solution). */
  choiceLimit?: number;
}

/**
 * Execute every (challenge × agent) run sequentially from identical
 * starting states (FR-026) and assemble the benchmark report (FR-025a).
 */
export async function runSuite(options: SuiteOptions): Promise<SuiteResult> {
  const { suiteId, challenges, agents } = options;
  const wanted = [...challenges].sort((a, b) => a.id.localeCompare(b.id));
  const runs: SuiteResult["runs"] = [];
  const total = wanted.length * agents.length;
  let completed = 0;
  for (const challenge of wanted) {
    for (const agent of agents) {
      const runId = `${suiteId}-${challenge.id}-${agent.id}`;
      runs.push(await runAgentChallenge({
        challenge,
        agent,
        runId,
        onUpdate: options.onRunUpdate,
        ...(options.choiceLimit !== undefined ? { choiceLimit: options.choiceLimit } : {}),
      }));
      completed += 1;
      options.onProgress?.(completed, total);
    }
  }
  const models = new Map(agents.map((a) => [a.id, a.model] as [string, string]));
  const solutions = new Map(
    wanted.filter((c) => c.solution !== undefined).map((c) => [c.id, c.solution!] as [string, string[]]),
  );
  return {
    suiteId,
    ranAt: new Date().toISOString(),
    challengeIds: wanted.map((c) => c.id),
    agentIds: agents.map((a) => a.id),
    runs,
    scores: scoreAgents(runs, models, solutions),
  };
}
