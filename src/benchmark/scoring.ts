import { ChallengeRun, PerAgentScore } from "../engine/types.ts";

/**
 * Aggregate per-agent scores (contracts/benchmark-report.md): score =
 * solved/total, ranked by score desc, totalSolverMoves asc, totalElapsedMs
 * asc. Scores are always derived from runs — never hand-edited.
 */
export function scoreAgents(
  runs: ChallengeRun[],
  models: Map<string, string>,
): PerAgentScore[] {
  const byAgent = new Map<string, ChallengeRun[]>();
  for (const run of runs) {
    const list = byAgent.get(run.agentId) ?? [];
    list.push(run);
    byAgent.set(run.agentId, list);
  }
  const scores: PerAgentScore[] = [...byAgent.entries()].map(([agentId, agentRuns]) => {
    const solved = agentRuns.filter((r) => r.status === "solved").length;
    return {
      agentId,
      model: models.get(agentId) ?? "unknown",
      solved,
      total: agentRuns.length,
      score: agentRuns.length === 0 ? 0 : solved / agentRuns.length,
      totalSolverMoves: agentRuns.reduce((n, r) => n + r.solverMoveCount, 0),
      totalElapsedMs: agentRuns.reduce((n, r) => n + (r.elapsedMs ?? 0), 0),
    };
  });
  scores.sort(
    (a, b) =>
      b.score - a.score ||
      a.totalSolverMoves - b.totalSolverMoves ||
      a.totalElapsedMs - b.totalElapsedMs,
  );
  return scores;
}
