import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { JevAgent } from "../../src/agents/agent-adapters/jev.ts";
import { MockAgent } from "../fixtures/mock-agent.ts";
import { SOLUTIONS } from "../fixtures/solutions.ts";
import { runAgentChallenge } from "../../src/agents/runner.ts";
import { getChallenge, loadLibrary } from "../../src/challenges/library.ts";

const CHALLENGES_DIR = join(import.meta.dir, "..", "fixtures", "challenges");

describe("structured reasoning runs (US1)", () => {
  test("structured fixture selection solves with Q&A on the recorded move", async () => {
    const { challenges } = await loadLibrary(CHALLENGES_DIR);
    const record = await runAgentChallenge({
      challenge: getChallenge(challenges, "mate-in-1-001"),
      agent: new MockAgent({ id: "mock-1", script: [], scripts: SOLUTIONS, structured: true }),
      runId: "reasoning-1",
    });
    expect(record.status).toBe("solved");
    const move = record.moves[0];
    expect(move.uci).toBe("h5f7");
    expect(move.reasoning?.question).toMatchObject({ name: "best_move", type: "choice" });
    expect(move.reasoning?.answer).toEqual({ answers: { best_move: { choice: "Qxf7#" } } });
  });

  test("no provider request is sent after the run is terminal", async () => {
    const { challenges } = await loadLibrary(CHALLENGES_DIR);
    let calls = 0;
    const agent = new MockAgent({ id: "mock-1", script: ["h5f7"], structured: true });
    const counting = { ...agent, requestMove: agent.requestMove.bind(agent) };
    const wrapped = Object.assign(Object.create(Object.getPrototypeOf(agent)), agent, {
      requestMove: async (state: Parameters<MockAgent["requestMove"]>[0]) => {
        calls += 1;
        return counting.requestMove(state);
      },
    });
    const record = await runAgentChallenge({
      challenge: getChallenge(challenges, "mate-in-1-001"),
      agent: wrapped,
      runId: "reasoning-2",
    });
    expect(record.status).toBe("solved");
    expect(calls).toBe(1);
  });

  test("structured mate-in-2 line records Q&A on every solver move", async () => {
    const { challenges } = await loadLibrary(CHALLENGES_DIR);
    const record = await runAgentChallenge({
      challenge: getChallenge(challenges, "mate-in-2-001"),
      agent: new MockAgent({ id: "mock-1", script: [], scripts: SOLUTIONS, structured: true }),
      runId: "reasoning-3",
    });
    expect(record.status).toBe("solved");
    const solverMoves = record.moves.filter((m) => m.source === "solver");
    expect(solverMoves).toHaveLength(2);
    for (const m of solverMoves) {
      expect(m.reasoning?.question).toMatchObject({ name: "best_move" });
      expect(m.reasoning?.answer).toMatchObject({ answers: { best_move: { choice: expect.any(String) } } });
    }
  });

  test("structured garbage selection fails as malformed with board unchanged", async () => {
    const { challenges } = await loadLibrary(CHALLENGES_DIR);
    const challenge = getChallenge(challenges, "mate-in-1-001");
    const record = await runAgentChallenge({
      challenge,
      agent: new MockAgent({ id: "mock-1", script: ["not-a-move"], structured: true }),
      runId: "reasoning-4",
    });
    expect(record.status).toBe("failed");
    expect(record.failReason).toBe("malformed_move");
    expect(record.moves).toHaveLength(1);
    expect(record.moves[0].rejected?.reason).toBe("malformed_move");
    expect(record.moves[0].resultingFen).toBe(challenge.fen);
  });

  test("provider transport error fails as agent_error", async () => {
    const saved = { ...process.env };
    const server = Bun.serve({ port: 0, fetch: () => new Response("boom", { status: 500 }) });
    process.env.JEV_API_KEY = "test-key";
    process.env.JEV_ENDPOINT = `http://127.0.0.1:${server.port}/move`;
    try {
      const { challenges } = await loadLibrary(CHALLENGES_DIR);
      const record = await runAgentChallenge({
        challenge: getChallenge(challenges, "mate-in-1-001"),
        agent: new JevAgent({ id: "jev-1", model: "jev-fixture" }),
        runId: "reasoning-5",
      });
      expect(record.status).toBe("failed");
      expect(record.failReason).toBe("agent_error");
    } finally {
      server.stop();
      process.env = saved;
    }
  });

  test("run records never contain credential values", async () => {
    const saved = { ...process.env };
    process.env.JEV_API_KEY = "super-secret-key-123";
    process.env.JEV_ENDPOINT = "http://127.0.0.1:9/unused";
    try {
      const { challenges } = await loadLibrary(CHALLENGES_DIR);
      const record = await runAgentChallenge({
        challenge: getChallenge(challenges, "mate-in-1-001"),
        agent: new MockAgent({ id: "mock-1", script: [], scripts: SOLUTIONS, structured: true }),
        runId: "reasoning-6",
      });
      expect(record.status).toBe("solved");
      const serialized = JSON.stringify(record);
      expect(serialized).not.toContain("super-secret-key-123");
      for (const m of record.moves) {
        expect(JSON.stringify(m.reasoning ?? {})).not.toContain("super-secret-key-123");
      }
    } finally {
      process.env = saved;
    }
  });
});
