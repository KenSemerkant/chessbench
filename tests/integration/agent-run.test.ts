import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { JevAgent } from "../../src/agents/agent-adapters/jev.ts";
import { MockAgent } from "../fixtures/mock-agent.ts";
import { runAgentChallenge } from "../../src/agents/runner.ts";
import { SOLUTIONS } from "../fixtures/solutions.ts";
import { getChallenge, loadLibrary } from "../../src/challenges/library.ts";

const CHALLENGES_DIR = join(import.meta.dir, "..", "fixtures", "challenges");

describe("agent runs (US2)", () => {
  test("mock agent solves mate-in-1 with recorded ids", async () => {
    const { challenges } = await loadLibrary(CHALLENGES_DIR);
    const challenge = getChallenge(challenges, "mate-in-1-001");
    const agent = new MockAgent({
      id: "mock-1",
      model: "mock-scripted",
      script: SOLUTIONS["mate-in-1-001"],
    });
    const record = await runAgentChallenge({ challenge, agent, runId: "agent-run-1" });
    expect(record.status).toBe("solved");
    expect(record.failReason).toBeNull();
    expect(record.agentId).toBe("mock-1");
    expect(record.model).toBe("mock-scripted");
    expect(record.moves.map((m) => m.uci)).toEqual(["h5f7"]);
    expect(record.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  test("mock agent solves mate-in-2 across defender reply", async () => {
    const { challenges } = await loadLibrary(CHALLENGES_DIR);
    const challenge = getChallenge(challenges, "mate-in-2-002");
    const agent = new MockAgent({ id: "mock-1", script: SOLUTIONS["mate-in-2-002"] });
    const record = await runAgentChallenge({ challenge, agent, runId: "agent-run-2" });
    expect(record.status).toBe("solved");
    expect(record.solverMoveCount).toBe(2);
    expect(record.moves.map((m) => `${m.source}:${m.uci}`)).toEqual([
      "solver:c6c7",
      "defender:a8a7",
      "solver:e2a2",
    ]);
  });

  test("malformed script move fails as malformed_move", async () => {
    const { challenges } = await loadLibrary(CHALLENGES_DIR);
    const record = await runAgentChallenge({
      challenge: getChallenge(challenges, "mate-in-1-001"),
      agent: new MockAgent({ id: "mock-1", script: ["nonsense"] }),
      runId: "agent-run-3",
    });
    expect(record.status).toBe("failed");
    expect(record.failReason).toBe("malformed_move");
  });

  test("illegal script move fails as illegal_move", async () => {
    const { challenges } = await loadLibrary(CHALLENGES_DIR);
    const record = await runAgentChallenge({
      challenge: getChallenge(challenges, "mate-in-1-001"),
      agent: new MockAgent({ id: "mock-1", script: ["e2e4"] }),
      runId: "agent-run-4",
    });
    expect(record.status).toBe("failed");
    expect(record.failReason).toBe("illegal_move");
  });

  test("slow agent fails as timeout", async () => {
    const { challenges } = await loadLibrary(CHALLENGES_DIR);
    const record = await runAgentChallenge({
      challenge: getChallenge(challenges, "mate-in-1-001"),
      agent: new MockAgent({ id: "mock-1", script: ["h5f7"], delayMs: 300, timeoutMs: 20 }),
      runId: "agent-run-5",
    });
    expect(record.status).toBe("failed");
    expect(record.failReason).toBe("timeout");
  });

  test("unconfigured provider fails as agent_unavailable before any move", async () => {
    const { challenges } = await loadLibrary(CHALLENGES_DIR);
    const saved = { ...process.env };
    delete process.env.JEV_API_KEY;
    delete process.env.JEV_ENDPOINT;
    try {
      const record = await runAgentChallenge({
        challenge: getChallenge(challenges, "mate-in-1-001"),
        agent: new JevAgent({ id: "jev-1", model: "jev-live" }),
        runId: "agent-run-6",
      });
      expect(record.status).toBe("failed");
      expect(record.failReason).toBe("agent_unavailable");
      expect(record.moves).toEqual([]);
    } finally {
      process.env = saved;
    }
  });
});
