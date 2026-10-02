import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";

const ENGINE_DIR = new URL("../../src/engine/", import.meta.url);
const FORBIDDEN = ["src/ui", "src/agents", "src/benchmark", "chessground", "react"];

describe("engine dependency boundary (FR-012, FR-024)", () => {
  test("src/engine imports chess.js and relative paths only", async () => {
    const files = (await readdir(ENGINE_DIR)).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = await Bun.file(new URL(file, ENGINE_DIR)).text();
      const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of specifiers) {
        expect(spec, `${file} imports ${spec}`).toMatch(/^(chess\.js|\.\.?\/)/);
        for (const forbidden of FORBIDDEN) {
          expect(spec.includes(forbidden), `${file} must not import ${spec}`).toBe(false);
        }
      }
      expect(source.includes("chessground"), `${file} must not reference chessground`).toBe(false);
    }
  });
});
