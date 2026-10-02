import { afterEach, describe, expect, test } from "bun:test";
import { JevAgent } from "../../src/agents/agent-adapters/jev.ts";
import { LayaAgent } from "../../src/agents/agent-adapters/laya.ts";
import { NimbleAgent } from "../../src/agents/agent-adapters/nimble.ts";
import { MockAgent } from "../fixtures/mock-agent.ts";
import { Agent, ChallengeState } from "../../src/agents/protocol/types.ts";

const STATE: ChallengeState = {
  challengeId: "mate-in-1-001",
  fen: "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w - - 0 1",
  sideToMove: "white",
  mateInN: 1,
  solverMovesUsed: 0,
  movesRemaining: 1,
  history: [],
  legalMoves: ["h5f7"],
};

const SAVED_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...SAVED_ENV };
});

/** Every adapter exposes the same identity shape (FR-019). */
function expectAgentShape(agent: Agent): void {
  expect(agent.id.length).toBeGreaterThan(0);
  expect(agent.model.length).toBeGreaterThan(0);
  expect(agent.timeoutMs).toBeGreaterThan(0);
}

function fixtureServer(body: unknown): { server: ReturnType<typeof Bun.serve>; url: string } {
  const server = Bun.serve({
    port: 0,
    fetch: () =>
      typeof body === "string" ? new Response(body) : Response.json(body),
  });
  return { server, url: `http://127.0.0.1:${server.port}/move` };
}

describe("agent contract", () => {
  test("MockAgent returns the scripted UCI", async () => {
    const agent = new MockAgent({ id: "mock-1", script: ["h5f7"] });
    expectAgentShape(agent);
    expect((await agent.requestMove(STATE)).uci).toBe("h5f7");
    expect(await agent.checkAvailability()).toEqual({ ok: true });
  });

  test("MockAgent structured mode returns Q&A shaped like a real answer", async () => {
    const agent = new MockAgent({ id: "mock-1", script: ["h5f7"], structured: true });
    const move = await agent.requestMove(STATE);
    expect(move.uci).toBe("h5f7");
    expect(move.reasoning?.question).toMatchObject({ name: "best_move", type: "choice" });
    expect(move.reasoning?.answer).toEqual({ answers: { best_move: { choice: "Qxf7#" } } });
  });

  test("MockAgent signals exhaustion by throwing (→ agent_error)", async () => {
    const agent = new MockAgent({ id: "mock-1", script: [] });
    await expect(agent.requestMove(STATE)).rejects.toThrow(/exhausted/);
  });

  test("JEV adapter returns the structured selection with Q&A", async () => {
    const { server, url } = fixtureServer({
      model: "jev-latest",
      answers: {
        best_move: {
          type: "choice",
          choice: "Qxf7#",
          confidence: 0.9,
          probabilities: { "Qxf7#": 0.9 },
        },
      },
      usage: { input_tokens: 1, output_tokens: 0 },
    });
    process.env.JEV_API_KEY = "test-key";
    process.env.JEV_ENDPOINT = url;
    try {
      const agent = new JevAgent({ id: "jev-1", model: "jev-fixture" });
      expectAgentShape(agent);
      expect(await agent.checkAvailability()).toEqual({ ok: true });
      const move = await agent.requestMove(STATE);
      expect(move.uci).toBe("h5f7");
      expect(move.reasoning?.question).toMatchObject({ name: "best_move", type: "choice" });
      expect(move.reasoning?.answer).toEqual({
        model: "jev-latest",
        answers: {
          best_move: {
            type: "choice",
            choice: "Qxf7#",
            confidence: 0.9,
            probabilities: { "Qxf7#": 0.9 },
          },
        },
        usage: { input_tokens: 1, output_tokens: 0 },
      });
    } finally {
      server.stop();
    }
  });

  test("JEV sends criteria as a SAN label→description dict", async () => {
    let seenBody: unknown = null;
    const server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        seenBody = await req.json();
        return Response.json({ answers: { best_move: { choice: "Qxf7#" } } });
      },
    });
    process.env.JEV_API_KEY = "test-key";
    process.env.JEV_ENDPOINT = `http://127.0.0.1:${server.port}/move`;
    try {
      expect((await new JevAgent({ id: "jev-1", model: "jev-fixture" }).requestMove(STATE)).uci).toBe(
        "h5f7",
      );
      const body = seenBody as {
        questions: { best_move: { criteria: Record<string, string> } };
      };
      expect(body.questions.best_move.criteria["Qxf7#"]).toBe("Qxf7#");
    } finally {
      server.stop();
    }
  });

  test("Nimble adapter sends dict criteria and needs no API key", async () => {
    let seenBody: unknown = null;
    let seenAuth: string | null = null;
    const server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        seenBody = await req.json();
        seenAuth = req.headers.get("authorization");
        return Response.json({ answers: { best_move: { choice: "Qxf7#" } } });
      },
    });
    delete process.env.NIMBLE_API_KEY;
    process.env.NIMBLE_ENDPOINT = `http://127.0.0.1:${server.port}/move`;
    try {
      const agent = new NimbleAgent({ id: "nimble-1", model: "nimble-fixture" });
      expectAgentShape(agent);
      expect(await agent.checkAvailability()).toEqual({ ok: true });
      const move = await agent.requestMove(STATE);
      expect(move.uci).toBe("h5f7");
      expect(move.reasoning?.question).toMatchObject({ name: "best_move", type: "choice" });
      const body = seenBody as { questions: { best_move: { criteria: Record<string, string> } } };
      expect(body.questions.best_move.criteria["Qxf7#"]).toBe("Qxf7#");
      expect(seenAuth).toBeNull();
    } finally {
      server.stop();
    }
  });

  test("bounded choices still cap when the winning move is not legal", async () => {
    let seen: unknown = null;
    const server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        seen = await req.json();
        return Response.json({ answers: { best_move: { choice: "Qxf7#" } } });
      },
    });
    process.env.JEV_API_KEY = "test-key";
    process.env.JEV_ENDPOINT = `http://127.0.0.1:${server.port}/move`;
    try {
      // "a1a1" is illegal here, so there is no anchor — but the cap must hold.
      const state: ChallengeState = { ...STATE, choiceLimit: 20, correctMove: "a1a1" };
      await new JevAgent({ id: "jev-1", model: "jev-fixture" }).requestMove(state);
      const body = seen as { questions: { best_move: { criteria: Record<string, string> } } };
      const labels = Object.keys(body.questions.best_move.criteria);
      expect(labels.length).toBeLessThanOrEqual(20);
      expect(labels.length).toBeGreaterThan(0);
    } finally {
      server.stop();
    }
  });

  test("Laya adapter returns the structured selection", async () => {
    const { server, url } = fixtureServer({ answers: { best_move: { choice: "Qxf7#" } } });
    process.env.LAYA_API_KEY = "test-key";
    process.env.LAYA_ENDPOINT = url;
    try {
      const agent = new LayaAgent({ id: "laya-1", model: "laya-fixture" });
      expectAgentShape(agent);
      const move = await agent.requestMove(STATE);
      expect(move.uci).toBe("h5f7");
      expect(move.reasoning?.answer).toEqual({ answers: { best_move: { choice: "Qxf7#" } } });
    } finally {
      server.stop();
    }
  });

  test("Laya sends SAN labels and needs no API key", async () => {
    let seenBody: unknown = null;
    let seenAuth: string | null = null;
    const server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        seenBody = await req.json();
        seenAuth = req.headers.get("authorization");
        return Response.json({ answers: { best_move: { choice: "Qxf7#" } } });
      },
    });
    delete process.env.LAYA_API_KEY;
    process.env.LAYA_ENDPOINT = `http://127.0.0.1:${server.port}/move`;
    try {
      const agent = new LayaAgent({ id: "laya-1", model: "laya-fixture" });
      expect(await agent.checkAvailability()).toEqual({ ok: true });
      expect((await agent.requestMove(STATE)).uci).toBe("h5f7");
      const body = seenBody as Record<string, unknown>;
      const criteria = (body.questions as Record<string, { criteria: unknown }>).best_move
        .criteria as string[];
      expect(criteria).toContain("Qxf7#");
      expect(criteria.every((c) => typeof c === "string")).toBe(true);
      expect(seenAuth).toBeNull();
    } finally {
      server.stop();
    }
  });

  test("JEV, Laya, and Nimble query the same position with the same move set", async () => {
    const seen: unknown[] = [];
    const { server, url } = ((): { server: ReturnType<typeof Bun.serve>; url: string } => {
      const s = Bun.serve({
        port: 0,
        fetch: async (req) => {
          seen.push(await req.json());
          return Response.json({ answers: { best_move: { choice: "Qxf7#" } } });
        },
      });
      return { server: s, url: `http://127.0.0.1:${s.port}/move` };
    })();
    process.env.JEV_API_KEY = "test-key";
    process.env.JEV_ENDPOINT = url;
    process.env.LAYA_API_KEY = "test-key";
    process.env.LAYA_ENDPOINT = url;
    process.env.NIMBLE_ENDPOINT = url;
    try {
      // Same model id across providers; state identical and criteria cover the
      // same moves (JEV/Nimble: {SAN: SAN} dict, Laya: SAN list).
      const jevMove = await new JevAgent({ id: "jev-1", model: "parity" }).requestMove(STATE);
      const layaMove = await new LayaAgent({ id: "laya-1", model: "parity" }).requestMove(STATE);
      const nimbleMove = await new NimbleAgent({ id: "nimble-1", model: "parity" }).requestMove(STATE);
      expect(jevMove.uci).toBe("h5f7");
      expect(layaMove.uci).toBe("h5f7");
      expect(nimbleMove.uci).toBe("h5f7");
      expect(seen).toHaveLength(3);
      const [jevBody, layaBody, nimbleBody] = seen as Array<{
        state: unknown;
        questions: { best_move: { criteria: unknown } };
      }>;
      expect(jevBody.state).toEqual(layaBody.state);
      expect(jevBody.state).toEqual(nimbleBody.state);
      const jevLabels = Object.keys(
        jevBody.questions.best_move.criteria as Record<string, string>,
      ).sort();
      const layaLabels = [
        ...(layaBody.questions.best_move.criteria as string[]),
      ].sort();
      const nimbleLabels = Object.keys(
        nimbleBody.questions.best_move.criteria as Record<string, string>,
      ).sort();
      expect(jevLabels).toEqual(layaLabels);
      expect(jevLabels).toEqual(nimbleLabels);
      expect(layaLabels).toContain("Qxf7#");
    } finally {
      server.stop();
    }
  });

  test("out-of-list selection yields empty UCI (→ malformed_move)", async () => {
    const { server, url } = fixtureServer({ best_move: "e2e4" });
    process.env.JEV_API_KEY = "test-key";
    process.env.JEV_ENDPOINT = url;
    try {
      const agent = new JevAgent({ id: "jev-1", model: "jev-fixture" });
      expect((await agent.requestMove(STATE)).uci).toBe("");
    } finally {
      server.stop();
    }
  });

  test("missing answer mapping yields empty UCI (→ malformed_move)", async () => {
    const { server, url } = fixtureServer({ something_else: 1 });
    process.env.JEV_API_KEY = "test-key";
    process.env.JEV_ENDPOINT = url;
    try {
      const agent = new JevAgent({ id: "jev-1", model: "jev-fixture" });
      expect((await agent.requestMove(STATE)).uci).toBe("");
    } finally {
      server.stop();
    }
  });

  test("non-JSON body yields empty UCI (→ malformed_move)", async () => {
    const { server, url } = fixtureServer("I recommend h5f7, trust me.");
    process.env.JEV_API_KEY = "test-key";
    process.env.JEV_ENDPOINT = url;
    try {
      const agent = new JevAgent({ id: "jev-1", model: "jev-fixture" });
      expect((await agent.requestMove(STATE)).uci).toBe("");
    } finally {
      server.stop();
    }
  });

  test("adapters report unavailable when env is missing", async () => {
    delete process.env.JEV_API_KEY;
    delete process.env.JEV_ENDPOINT;
    const agent = new JevAgent({ id: "jev-1", model: "jev-fixture" });
    expect(await agent.checkAvailability()).toEqual({ ok: false, reason: "missing JEV_API_KEY" });
  });

  test("adapters throw when requestMove is called unconfigured", async () => {
    delete process.env.LAYA_API_KEY;
    delete process.env.LAYA_ENDPOINT;
    const agent = new LayaAgent({ id: "laya-1", model: "laya-fixture" });
    await expect(agent.requestMove(STATE)).rejects.toThrow(/not configured/);
  });
});
