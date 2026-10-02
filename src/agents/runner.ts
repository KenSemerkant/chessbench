import { legalUciMoves } from "../engine/moves.ts";
import { EngineRun } from "../engine/run.ts";
import { Challenge, ChallengeRun } from "../engine/types.ts";
import { Agent, ChallengeState } from "./protocol/types.ts";

export interface AgentRunOptions {
  challenge: Challenge;
  agent: Agent;
  runId: string;
  /** Observational snapshots; no playback delays are introduced into execution. */
  onUpdate?: (run: ChallengeRun) => void;
  /** Cap the candidate moves offered each turn (keeps the proven solution). */
  choiceLimit?: number;
}

/**
 * Drive one full headless run: build ChallengeState per solver turn, race
 * requestMove against the agent timeout, and let the engine validate every
 * reply. Provider throw ⇒ agent_error; silence past timeoutMs ⇒ timeout.
 */
export async function runAgentChallenge(options: AgentRunOptions): Promise<ChallengeRun> {
  const { challenge, agent, runId } = options;
  const run = new EngineRun(challenge, agent.id);
  const solution = challenge.solution;
  const publish = (): void => options.onUpdate?.(run.toRunRecord(runId, agent.model));
  publish();

  const availability = await agent.checkAvailability();
  if (!availability.ok) {
    run.abort("agent_unavailable", availability.reason);
    publish();
    return run.toRunRecord(runId, agent.model);
  }

  while (run.snapshot().status === "in_progress") {
    const snap = run.snapshot();
    const correctMove = solution?.[snap.solverMoveCount];
    const state: ChallengeState = {
      challengeId: challenge.id,
      fen: snap.fen,
      sideToMove: challenge.sideToMove,
      mateInN: challenge.mateInN,
      solverMovesUsed: snap.solverMoveCount,
      movesRemaining: challenge.mateInN - snap.solverMoveCount,
      history: snap.moves.filter((m) => !m.rejected).map((m) => m.uci),
      legalMoves: legalUciMoves(snap.fen),
      ...(options.choiceLimit !== undefined ? { choiceLimit: options.choiceLimit } : {}),
      ...(correctMove !== undefined ? { correctMove } : {}),
    };

    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const move = await Promise.race([
        agent.requestMove(state),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`agent timed out after ${agent.timeoutMs}ms`)),
            agent.timeoutMs,
          );
        }),
      ]);
      run.applySolverMove(move.uci, move.reasoning);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      if (message.includes("timed out")) {
        run.abort("timeout", message);
      } else {
        run.abort("agent_error", message);
      }
    } finally {
      if (timeout !== null) clearTimeout(timeout);
    }
    publish();
  }

  return run.toRunRecord(runId, agent.model);
}
