import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runSuite } from "../../src/benchmark/runner.ts";
import { JevAgent } from "../../src/agents/agent-adapters/jev.ts";
import { getChallenge, loadLibrary } from "../../src/challenges/library.ts";
import { startServer } from "../../src/ui/server.ts";

const CHALLENGES_DIR = join(import.meta.dir, "..", "fixtures", "challenges");

const server = startServer(0, CHALLENGES_DIR);
const BASE = `http://127.0.0.1:${server.port}`;

afterAll(() => {
  server.stop();
});

async function waitForDone(id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 100; i++) {
    const res = await fetch(`${BASE}/api/benchmarks/${id}`);
    const job = (await res.json()) as Record<string, unknown>;
    if (job.status === "done" || job.status === "error") return job;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`job ${id} did not finish in time`);
}

describe("benchmark API (US1)", () => {
  test("agent offers report availability without secret values", async () => {
    const saved = { ...process.env };
    process.env.JEV_API_KEY = "super-secret-key-123";
    delete process.env.JEV_ENDPOINT;
    try {
      const offers = (await (await fetch(`${BASE}/api/agents`)).json()) as Array<{
        id: string;
        available: boolean;
        reason: string | null;
      }>;
      const ids = offers.map((o) => o.id).sort();
      expect(ids).toEqual(["jev", "laya", "nimble", "tev"]);
      const serialized = JSON.stringify(offers);
      expect(serialized).not.toContain("super-secret-key-123");
      const jev = offers.find((o) => o.id === "jev")!;
      expect(jev.available).toBe(false);
      expect(jev.reason).toBe("missing JEV_ENDPOINT");
    } finally {
      process.env = saved;
    }
  });

  test("bad selections are rejected before any job starts", async () => {
    const badChallenge = await fetch(`${BASE}/api/benchmarks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeIds: ["nope"], agents: ["jev"] }),
    });
    expect(badChallenge.status).toBe(400);
    const badAgent = await fetch(`${BASE}/api/benchmarks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeIds: ["mate-in-1-001"], agents: ["hal"] }),
    });
    expect(badAgent.status).toBe(400);
    for (const kind of ["mock", "mock-scripted", "first-legal", "legal-first"]) {
      const removedAgent = await fetch(`${BASE}/api/benchmarks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeIds: ["mate-in-1-001"], agents: [{ kind }] }),
      });
      expect(removedAgent.status).toBe(400);
      expect((await removedAgent.json()).error).toContain("expected jev|laya|nimble|tev");
    }
    for (const choiceLimit of [0, -3, 1.5, "20"]) {
      const badLimit = await fetch(`${BASE}/api/benchmarks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeIds: ["mate-in-1-001"], agents: ["jev"], choiceLimit }),
      });
      expect(badLimit.status).toBe(400);
      expect((await badLimit.json()).error).toContain("choiceLimit");
    }
    const unknown = await fetch(`${BASE}/api/benchmarks/does-not-exist`);
    expect(unknown.status).toBe(404);
  });

  test("polling exposes initial and intermediate positions while an agent is thinking", async () => {
    const saved = { ...process.env };
    let release: (() => void) | undefined;
    let calls = 0;
    const provider = Bun.serve({ port: 0, fetch: async () => {
      calls += 1;
      if (calls === 2) await new Promise<void>((resolve) => { release = resolve; });
      return Response.json({ answers: { best_move: { choice: calls === 1 ? "Kc7" : "Qa5#" } } });
    } });
    process.env.JEV_API_KEY = "test-key";
    process.env.JEV_ENDPOINT = `http://127.0.0.1:${provider.port}/move`;
    try {
      const started = await fetch(`${BASE}/api/benchmarks`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeIds: ["mate-in-2-001"], agents: ["jev"] }),
      });
      const { id } = await started.json() as { id: string };
      for (let i = 0; !release && i < 100; i++) await new Promise((resolve) => setTimeout(resolve, 10));
      expect(release).toBeDefined();
      const job = await (await fetch(`${BASE}/api/benchmarks/${id}`)).json();
      expect(job.status).toBe("running");
      expect(job.runs[0].status).toBe("in_progress");
      expect(job.runs[0].moves).toHaveLength(2);
      expect(job.runs[0].moves[0].uci).toBe("c6c7");
      expect(JSON.stringify(job)).not.toContain("test-key");
      release?.();
      const completed = await waitForDone(id);
      expect((completed.runs as Array<{ status: string }>)[0].status).toBe("solved");
    } finally {
      release?.();
      provider.stop(true);
      process.env = saved;
    }
  });

  test("UI-triggered suite matches the headless report", async () => {
    const saved = { ...process.env };
    const provider = Bun.serve({
      port: 0,
      fetch: () => Response.json({ answers: { best_move: { choice: "Qxf7#" } } }),
    });
    process.env.JEV_API_KEY = "test-key";
    process.env.JEV_ENDPOINT = `http://127.0.0.1:${provider.port}/move`;
    try {
      const started = await fetch(`${BASE}/api/benchmarks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeIds: ["mate-in-1-001"], agents: ["jev"] }),
      });
      expect(started.status).toBe(201);
      const { id } = (await started.json()) as { id: string };
      const job = await waitForDone(id);
      expect(job.status).toBe("done");
      expect(job.completedRuns).toBe(job.totalRuns);

      const report = job.report as Record<string, unknown>;
      const { challenges } = await loadLibrary(CHALLENGES_DIR);
      const expected = await runSuite({
        suiteId: "parity",
        challenges: [getChallenge(challenges, "mate-in-1-001")],
        agents: [new JevAgent({ id: "jev", model: process.env.JEV_MODEL ?? "jev-latest" })],
      });
      const runs = report.runs as Array<Record<string, unknown>>;
      expect(runs.map((r) => [r.challengeId, r.agentId, r.status])).toEqual(
        expected.runs.map((r) => [r.challengeId, r.agentId, r.status]),
      );
      const scores = report.scores as Array<Record<string, unknown>>;
      const expectedScores = expected.scores as unknown as Array<Record<string, unknown>>;
      const stable = (s: Record<string, unknown>) => [
        s.agentId,
        s.model,
        s.solved,
        s.total,
        s.score,
        s.totalSolverMoves,
      ];
      expect(scores.map(stable)).toEqual(expectedScores.map(stable));
      expect(runs[0].status).toBe("solved");
    } finally {
      provider.stop();
      process.env = saved;
    }
  });
});
