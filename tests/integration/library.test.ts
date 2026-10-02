import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getChallenge, loadLibrary } from "../../src/challenges/library.ts";
import { ChallengeLoadError } from "../../src/engine/types.ts";

const VALID = {
  id: "custom-1",
  title: "Custom",
  fen: "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w - - 0 1",
  sideToMove: "white",
  mateInN: 1,
};

let dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

async function scratch(files: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "chessbench-lib-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(
      join(dir, name),
      typeof content === "string" ? content : JSON.stringify(content),
    );
  }
  return dir;
}

describe("challenge library (US5)", () => {
  test("new valid definition loads by id with no code change", async () => {
    const dir = await scratch({ "custom-1.json": VALID });
    const { challenges, errors } = await loadLibrary(dir);
    expect(errors).toEqual([]);
    expect(getChallenge(challenges, "custom-1").title).toBe("Custom");
  });

  test("invalid FEN error names file, field, and reason", async () => {
    const dir = await scratch({
      "broken.json": { ...VALID, id: "broken", fen: "not-a-fen" },
    });
    const { challenges, errors } = await loadLibrary(dir);
    expect(challenges).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ChallengeLoadError);
    expect(errors[0].message).toMatch(/broken\.json/);
    expect(errors[0].message).toMatch(/"fen"/);
  });

  test("side-to-move mismatch is rejected", async () => {
    const dir = await scratch({
      "mismatch.json": { ...VALID, id: "mismatch", sideToMove: "black" },
    });
    const { errors } = await loadLibrary(dir);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/"sideToMove"/);
  });

  test("duplicate ids reject all but the first file", async () => {
    const dir = await scratch({
      "a-first.json": VALID,
      "b-second.json": { ...VALID, title: "Second" },
    });
    const { challenges, errors } = await loadLibrary(dir);
    expect(challenges.map((c) => c.title)).toEqual(["Custom"]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/duplicate challenge id/);
  });

  test("already-terminal positions are rejected", async () => {
    const dir = await scratch({
      "mated.json": {
        ...VALID,
        id: "mated",
        fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
        sideToMove: "black",
      },
    });
    const { challenges, errors } = await loadLibrary(dir);
    expect(challenges).toEqual([]);
    expect(errors[0].message).toMatch(/stalemate|checkmate/);
  });

  test("non-positive mateInN is rejected", async () => {
    const dir = await scratch({ "zero.json": { ...VALID, id: "zero", mateInN: 0 } });
    const { errors } = await loadLibrary(dir);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/"mateInN"/);
  });

  test("malformed JSON file is skipped with an error", async () => {
    const dir = await scratch({ "junk.json": "{ not json" });
    const { challenges, errors } = await loadLibrary(dir);
    expect(challenges).toEqual([]);
    expect(errors[0].message).toMatch(/not valid JSON/);
  });

  test("unknown id throws a useful error", async () => {
    const dir = await scratch({ "custom-1.json": VALID });
    const { challenges } = await loadLibrary(dir);
    expect(() => getChallenge(challenges, "missing")).toThrow(/unknown challenge id/);
  });
});
