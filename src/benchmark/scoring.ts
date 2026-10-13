import { ChallengeRun, PerAgentScore } from "../engine/types.ts";

/**
 * Aggregate per-agent scores (contracts/benchmark-report.md): score =
 * solved/total, ranked by score desc, totalSolverMoves asc, totalElapsedMs
 * asc. Scores are always derived from runs — never hand-edited.
 *
 * With `solutions`, also counts per-move accuracy against the proven line:
 * hits = length of the matching prefix of applied solver moves; turns =
 * prefix + the first miss (moves after divergence are off-line, not counted).
 */
export function scoreAgents(
  runs: ChallengeRun[],
  models: Map<string, string>,
  solutions: Map<string, string[]> = new Map(),
): PerAgentScore[] {
  const byAgent = new Map<string, ChallengeRun[]>();
  for (const run of runs) {
    const list = byAgent.get(run.agentId) ?? [];
    list.push(run);
    byAgent.set(run.agentId, list);
  }
  const scores: PerAgentScore[] = [...byAgent.entries()].map(([agentId, agentRuns]) => {
    const solved = agentRuns.filter((r) => r.status === "solved").length;
    let solutionMoveHits = 0;
    let solutionMoveTurns = 0;
    for (const run of agentRuns) {
      const solution = solutions.get(run.challengeId);
      if (!solution) continue;
      const applied = run.moves.filter((m) => m.source === "solver" && !m.rejected);
      let hits = 0;
      while (hits < applied.length && hits < solution.length && applied[hits].uci === solution[hits]) {
        hits += 1;
      }
      solutionMoveHits += hits;
      solutionMoveTurns += Math.min(applied.length, hits + 1);
    }
    return {
      agentId,
      model: models.get(agentId) ?? "unknown",
      solved,
      total: agentRuns.length,
      score: agentRuns.length === 0 ? 0 : solved / agentRuns.length,
      totalSolverMoves: agentRuns.reduce((n, r) => n + r.solverMoveCount, 0),
      totalElapsedMs: agentRuns.reduce((n, r) => n + (r.elapsedMs ?? 0), 0),
      solutionMoveHits,
      solutionMoveTurns,
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
